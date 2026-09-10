import { randomUUID } from 'node:crypto';
import { createRequestLedger } from '../ai/requests.mjs';
import { openWorkspace } from '../sources/records.mjs';
import { createPairingManager, publicConnection } from './pairing.mjs';
import { isHash, isMode, isRevision, isUuid, projectRemoteState,
  remoteError, remoteFail, remoteRequestShape, remoteLedgerInput, REMOTE_WRITES, ARTWORK_WRITES } from './remote-policy.mjs';

import { projectArtwork, projectArtworkItem, projectArtworkReview, projectArtworkReceipt, projectArtworkImage } from './remote-artwork.mjs';

const publicAction = action => REMOTE_WRITES.some(operation => action === 'remote-' + operation);
const absent = requestId => ({ requestId, operation: null, state: 'not-found' });
function checkReceiptOwnership(receipt, requestId) {
  if (receipt?.requestId !== requestId || !isUuid(requestId)) remoteFail('remote-operation-unconfirmed');
  // Missing/corrupt claims are not proof that an operation never existed.
  // Return no contents or connection details, but retain the uncertainty.
  if (receipt.state === 'unconfirmed' && (!isUuid(receipt.connectionId) || typeof receipt.action !== 'string'))
    remoteFail('remote-operation-unconfirmed');
}
function planResult(data) {
  if (!isHash(data?.planId) || !isHash(data.scopeId) || !isRevision(data.revision) || !isMode(data.mode)
    || !Number.isSafeInteger(data.changedFileCount) || data.changedFileCount < 0) remoteFail('remote-operation-unconfirmed');
  return { planId: data.planId, scopeId: data.scopeId, revision: data.revision, mode: data.mode, changedFileCount: data.changedFileCount };
}
function applyResult(data) {
  if (!isUuid(data?.planRequestId) || !isHash(data.scopeId) || !isRevision(data.revision) || !isMode(data.preparedMode)
    || data.readback !== 'matched') remoteFail('remote-operation-unconfirmed');
  return { planRequestId: data.planRequestId, scopeId: data.scopeId, revision: data.revision,
    preparedMode: data.preparedMode, readback: 'matched', runtimeState: 'unknown' };
}
function projectReceipt(receipt) {
  const base = { requestId: receipt.requestId, operation: receipt.action.slice('remote-'.length), state: receipt.state };
  if (receipt.state !== 'completed') return { ...base, state: ['running', 'unconfirmed'].includes(receipt.state) ? receipt.state : 'unconfirmed' };
  if (receipt.result?.ok === false) return { ...base, result: { ok: false, error: remoteError(receipt.result.error) } };
  if (receipt.result?.ok !== true) return { ...base, state: 'unconfirmed' };
  try {
    const data = receipt.action === 'remote-plan' ? planResult(receipt.result.data)
      : receipt.action === 'remote-apply' ? applyResult(receipt.result.data)
        : receipt.action === 'remote-review-appearance-import' ? projectArtworkReview(receipt.result.data)
          : projectArtworkReceipt(receipt.result.data);
    return { ...base, result: { ok: true, data } };
  }
  catch { return { ...base, state: 'unconfirmed' }; }
}

export async function readPublicOperation({ workspace, requestId }) {
  if (!isUuid(requestId)) remoteFail('remote-invalid-request');
  const ledger = await createRequestLedger({ workspace, connectionId: randomUUID() });
  const raw = await ledger.status(requestId);
  checkReceiptOwnership(raw, requestId);
  return publicAction(raw.action) ? projectReceipt(raw) : absent(requestId);
}

export async function createRemoteController({ controller, webOrigin, now, enqueue = perform => perform() }) {
  const metadata = await controller.metadata();
  const pairing = createPairingManager({ launchId: metadata.launchId, webOrigin, now });
  const ledgers = new WeakMap(), active = new Set();
  let stopping = false;
  async function binding() {
    const meta = await controller.metadata();
    if (!meta.workspace) remoteFail('remote-registration-required');
    const w = await openWorkspace(meta.workspace), after = await controller.metadata();
    if (meta.contextId !== after.contextId || meta.launchId !== after.launchId || meta.workspace !== after.workspace) remoteFail('remote-connection-changed');
    return { launchId: meta.launchId, contextId: meta.contextId, workspace: meta.workspace, application: meta.application,
      scopeId: w.scopeId, rootScopeId: w.rootScopeId ?? w.scopeId, collectionScopeId: w.rootScopeId ?? w.scopeId };
  }
  async function authorize(auth) {
    if (stopping) remoteFail('remote-connection-expired');
    return pairing.authorize(auth, await binding());
  }
  function ledgerFor(session) {
    if (!ledgers.has(session)) ledgers.set(session, createRequestLedger({ workspace: session.workspace, connectionId: session.connectionId }));
    return ledgers.get(session);
  }
  async function currentState(session) {
    const state = await controller.state();
    if (state.metadata?.launchId !== session.launchId || state.metadata?.contextId !== session.contextId
      || state.metadata?.workspace !== session.workspace || state.source?.registration?.scopeId !== session.scopeId
      || (state.source?.registration?.rootScopeId ?? state.source?.registration?.scopeId) !== session.rootScopeId) remoteFail('remote-connection-changed');
    return projectRemoteState(state);
  }
  async function receiptFor(session, requestId) {
    const raw = await (await ledgerFor(session)).status(requestId);
    checkReceiptOwnership(raw, requestId);
    if (raw.connectionId !== session.connectionId || !publicAction(raw.action)) return absent(requestId);
    return projectReceipt(raw);
  }
  async function perform(operation, input, session, ledger, auth) {
    try {
      // A queued request is authorized again when execution can start. Once the
      // service starts, expiry/disconnect must not cancel it or receipt storage.
      const checked = await authorize(auth);
      if (checked !== session) remoteFail('remote-connection-changed');
      const context = { launchId: session.launchId, contextId: session.contextId };
      if (ARTWORK_WRITES.includes(operation)) {
        const { requestId, ...payload } = input;
        const raw = await controller.execute(operation, { ...context, ...payload });
        const data = operation === 'review-appearance-import' ? projectArtworkReview(raw, session) : projectArtworkReceipt(raw, session);
        if (operation === 'save-appearance-import' && (data.reviewId !== input.reviewId || !isHash(data.savedItemId)))
          remoteFail('remote-state-unconfirmed');
        return { ok: true, data };
      }
      const current = await currentState(session);
      if (operation === 'plan') {
        if (current.revision !== input.expectedRevision) remoteFail('remote-stale-plan');
        const planned = await controller.execute('plan', { ...context, mode: input.mode });
        if (planned.scopeId !== session.scopeId || planned.revision !== input.expectedRevision
          || planned.mode !== input.mode || !Array.isArray(planned.changedFiles)) remoteFail('remote-state-unconfirmed');
        return { ok: true, data: planResult({ ...planned, changedFileCount: planned.changedFiles.length }) };
      }
      const prior = await ledger.status(input.planRequestId);
      if (prior.connectionId !== session.connectionId || prior.action !== 'remote-plan' || prior.state !== 'completed'
        || prior.result?.ok !== true) remoteFail('remote-plan-unavailable');
      const planned = planResult(prior.result.data);
      if (planned.scopeId !== session.scopeId || planned.revision !== current.revision) remoteFail('remote-stale-plan');
      const applied = await controller.execute('apply', { ...context, planId: planned.planId });
      return { ok: true, data: applyResult({ ...applied, scopeId: session.scopeId, planRequestId: input.planRequestId }) };
    } catch (error) {
      return { ok: false, error: remoteError(error) };
    }
  }
  async function readArtwork(operation, input, session, auth) {
    const context = { launchId: session.launchId, contextId: session.contextId };
    const result = operation === 'artwork-image'
      ? projectArtworkImage(await controller.image({ ...context, ...input }), input.assetId)
      : await controller.execute(operation, { ...context, ...(operation === 'artwork' && input.after === null ? {} : input) });
    // Reads do not need a historical completion receipt. Never return data for
    // a changed/revoked binding, or relabel the result as belonging to a new one.
    if (await authorize(auth) !== session) remoteFail('remote-connection-changed');
    if (operation === 'artwork-image') return result;
    if (operation === 'artwork') return projectArtwork(result, session);
    if (operation === 'artwork-item') {
      const view = projectArtworkItem(result, session);
      if (view.item.id !== input.itemId) remoteFail('remote-state-unconfirmed');
      return view;
    }
    const review = projectArtworkReview(result, session);
    if (review.reviewId !== input.reviewId) remoteFail('remote-state-unconfirmed');
    return review;
  }
  async function request(operation, input, auth) {
    auth = { token: auth?.token, origin: auth?.origin };
    const session = await authorize(auth);
    let payload = remoteRequestShape(operation, input);
    input = null;
    if (operation === 'redeem') remoteFail('remote-invalid-request');
    if (operation === 'status') return { connection: publicConnection(session), state: await currentState(session) };
    if (operation === 'operation-status') return receiptFor(session, payload.requestId);
    if (!REMOTE_WRITES.includes(operation)) return readArtwork(operation, payload, session, auth);
    const ledger = await ledgerFor(session), requestId = payload.requestId, action = 'remote-' + operation;
    const claimInput = remoteLedgerInput(operation, payload);
    try {
      const result = await ledger.execute({ requestId, connectionId: session.connectionId, action, input: claimInput },
        () => enqueue(async () => {
          try { return await perform(operation, payload, session, ledger, auth); }
          finally { payload = null; }
        }));
      checkReceiptOwnership(result, requestId);
      if (result.connectionId !== session.connectionId || result.action !== action) remoteFail('remote-operation-unconfirmed');
      return projectReceipt(result);
    } finally { payload = null; }
  }
  return {
    webOrigin: pairing.webOrigin,
    // HTTP admission check, before parsing even the first upload body byte.
    authenticate: async auth => { await authorize(auth); },
    async issue() { return pairing.issue(await binding()); },
    async approve(pairingId) { if (!isUuid(pairingId)) remoteFail('remote-invalid-request'); return pairing.approve(pairingId, await binding()); },
    async details(pairingId) { return pairing.details(pairingId, await binding()); },
    cancel(pairingId) { return pairing.cancel(pairingId); },
    async redeem(input, origin) { remoteRequestShape('redeem', input); return pairing.redeem({ ...input, origin }, await binding()); },
    revoke(connectionId) { return pairing.revoke(connectionId); },
    async localReceipt(requestId) {
      const selected = await binding();
      return readPublicOperation({ workspace: selected.workspace, requestId });
    },
    request(operation, input, auth) {
      if (stopping) return Promise.reject(Object.assign(Error('remote-connection-expired'), { kind: 'remote-connection-expired' }));
      const promise = request(operation, input, auth);
      active.add(promise);
      promise.then(() => active.delete(promise), () => active.delete(promise));
      return promise;
    },
    async close() {
      stopping = true;
      await Promise.allSettled([...active]);
      pairing.close();
    },
  };
}
