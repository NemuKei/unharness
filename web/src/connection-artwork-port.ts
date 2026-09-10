import { ApiError } from './api.ts';
import { PublicArtworkError, isArtworkWrite } from './connection-artwork.ts';
import type { PublicConnection, ConnectionSnapshot } from './connection';
import type { ArtworkPort, ArtworkAction } from './artwork';

export function publicArtworkKey(view: ConnectionSnapshot) {
  const c = view.connection;
  return c ? ['public-v2',c.connectionId,c.launchId,c.target.scopeId,c.target.collectionScopeId].join(':') : 'public-v2:disconnected';
}
function portError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const original = error instanceof PublicArtworkError ? error.kind : 'remote-state-unconfirmed';
  const kind = original === 'remote-artwork-stale' ? 'appearance-state-conflict' : original;
  const rejected = kind.startsWith('appearance-') || ['remote-capacity','remote-invalid-request','remote-operation-conflict'].includes(kind);
  return new ApiError(kind, undefined, rejected ? 'rejected' : 'uncertain');
}
/** An ArtworkPort, not an Api. It captures no private URL, local token or path.
 * A repeated write UUID is resolved by the client through lookup only. */
export function createPublicArtworkPort(client: PublicConnection, view = client.getSnapshot()): ArtworkPort {
  const key = publicArtworkKey(view), c = view.connection;
  const current = () => {
    client.tick(); const now = client.getSnapshot();
    if (publicArtworkKey(now) !== key || now.phase !== 'connected') throw new ApiError('gui-source-context-changed', undefined, 'auth-required');
  };
  return { key, scopeId: c?.target.scopeId ?? null, collectionScopeIds: c ? [c.target.collectionScopeId] : [],
    enabled: view.phase === 'connected' && c !== null, busy: view.busy,
    async execute(action: ArtworkAction, input, requestId) {
      current();
      try {
        if (isArtworkWrite(action)) {
          const receipt = await client.artworkWrite(action, input, requestId);
          // Return only data, never interpret an artwork result as mode apply.
          // The shared hook rechecks its port key before updating the view.
          if (receipt.state !== 'completed') throw new ApiError('remote-operation-unconfirmed', undefined, 'uncertain');
          if (!receipt.result.ok) throw new ApiError(receipt.result.error.kind, undefined, 'rejected');
          return receipt.result.data;
        }
        if (!['artwork','artwork-item','read-appearance-import'].includes(action)) throw new ApiError('remote-invalid-request');
        const normalized = action === 'artwork' && Object.keys(input).length === 0 ? { after: null } : input;
        return await client.artworkRead(action as 'artwork'|'artwork-item'|'read-appearance-import', normalized);
      } catch (error) { throw portError(error); }
    },
    async image(referenceId, asset, signal) {
      current();
      try { return await client.artworkImage(referenceId, asset, signal); }
      catch (error) { throw portError(error); }
    },
  };
}
