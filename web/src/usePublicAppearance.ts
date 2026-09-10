import { useEffect, useRef } from 'react';
import { createPublicArtworkPort } from './connection-artwork-port';
import { useAppearanceController } from './useAppearanceController';
import type { PublicConnection, ConnectionSnapshot } from './connection';
import type { ArtworkView } from './artwork';

export function usePublicAppearance(client: PublicConnection, view: ConnectionSnapshot) {
  const port = createPublicArtworkPort(client, view);
  const artwork = useAppearanceController(port, String(view.artworkVersion));
  const latest = useRef(artwork); latest.current = artwork;
  // Private-MCP updates have no browser receipt. Re-read metadata only while
  // visible; collectionRevision keeps stale reads from replacing newer views.
  useEffect(() => {
    if (!port.enabled) return;
    let reading = false, stopped = false;
    const poll = async () => {
      const current = latest.current;
      if (stopped || reading || document.visibilityState !== 'visible' || !current.enabled || current.busy || client.getSnapshot().busy) return;
      reading = true;
      try {
        if (!current.confirmed || !current.view) { await current.load(); return; }
        const metadata = await client.artworkRead('artwork', { after: null }) as ArtworkView;
        if (stopped || latest.current.key !== current.key) return;
        const visible = latest.current.view;
        // A metadata poll must not replace pages the user has already opened.
        // A changed state or pending journal still requires a fresh view.
        if (!visible || metadata.stateId !== visible.stateId || metadata.collectionRevision !== visible.collectionRevision
          || metadata.pendingStateId !== visible.pendingStateId || metadata.recoveryRequired !== visible.recoveryRequired)
          await latest.current.load();
      } catch {
        // Use the shared controller's error display and recovery behavior.
        // Authentication/context failures may already have disabled this port.
        if (!stopped && latest.current.key === current.key) await latest.current.load();
      } finally { reading = false; }
    };
    const timer = window.setInterval(() => { void poll(); }, 3000);
    document.addEventListener('visibilitychange', poll);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', poll); };
  }, [client, port.key, port.enabled]);
  return artwork;
}
