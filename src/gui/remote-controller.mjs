import { randomUUID } from 'node:crypto';
import { createRequestLedger } from '../ai/requests.mjs';
import { openWorkspace } from '../sources/records.mjs';
import { createPairingManager, publicConnection } from './pairing.mjs';
import { isHash, isMode, isRevision, isUuid, projectRemoteState,
  remoteError, remoteFail, remoteRequestShape } from './remote-policy.mjs';

const publicAction = action => ['remote-plan', 'remote-apply'].includes(action);
const absent = requestId => ({ requestId, operation: null, state: 'not-found' });
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
  if (receipt.state !== 'completed') return base;
  if (receipt.result?.ok === false) return { ...base, result: { ok: false, error: remoteError(receipt.result.error) } };
  if (receipt.result?.ok !== true) return { ...base, state: 'unconfirmed' };
  try { return { ...base, result: { ok: true, data: receipt.action === 'remote-plan'
    ? planResult(receipt.result.data) : applyResult(receipt.result.data) } }; }
  catch { return { ...base, state: 'unconfirmed' }; }
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
      scopeId: w.scopeId, rootScopeId: w.rootScopeId };
  }
  async function authorize(auth) { return pairing.authorize(auth, await binding()); }
  function ledgerFor(session) {
    if (!ledgers.has(session)) ledgers.set(session, createRequestLedger({ workspace: session.workspace, connectionId: session.connectionId }));
    return ledgers.get(session);
  }
  async function currentState(session) {
    const state = await controller.state();
    if (state.metadata?.launchId !== session.launchId || state.metadata?.contextId !== session.contextId
      || state.metadata?.workspace !== session.workspace || state.source?.registration?.scopeId !== session.scopeId
      || state.source?.registration?.rootScopeId !== session.rootScopeId) remoteFail('remote-connection-changed');
    return projectRemoteState(state);
  }
  async function receiptFor(session, requestId) {
    const raw = await (await ledgerFor(session)).status(requestId);
    if (raw.connectionId !== session.connectionId || !publicAction(raw.action)) return absent(requestId);
    return projectReceipt(raw);
  }
  async function perform(operation, input, session, ledger, auth) {
    try {
      // A queued request is authorized again when execution can start. Once the
      // service starts, expiry/disconnect must not cancel it or receipt storage.
      await authorize(auth);
      const current = await currentState(session);
      const context = { launchId: session.launchId, contextId: session.contextId };
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
  async function request(operation, input, auth) {
    remoteRequestShape(operation, input);
    if (!['status', 'plan', 'apply', 'operation-status'].includes(operation)) remoteFail('remote-invalid-request');
    const session = await authorize(auth);
    if (operation === 'status') return { connection: publicConnection(session), state: await currentState(session) };
    if (operation === 'operation-status') return receiptFor(session, input.requestId);
    const ledger = await ledgerFor(session);
    const result = await ledger.execute({ requestId: input.requestId, connectionId: session.connectionId,
      action: 'remote-' + operation, input }, () => enqueue(() => perform(operation, input, session, ledger, auth)));
    if (result.connectionId !== session.connectionId || !publicAction(result.action)) remoteFail('remote-operation-unconfirmed');
    return projectReceipt(result);
  }
  return {
    webOrigin: pairing.webOrigin,
    async issue() { return pairing.issue(await binding()); },
    async approve(pairingId) { if (!isUuid(pairingId)) remoteFail('remote-invalid-request'); return pairing.approve(pairingId, await binding()); },
    async redeem(input, origin) { remoteRequestShape('redeem', input); return pairing.redeem({ ...input, origin }, await binding()); },
    revoke(connectionId) { return pairing.revoke(connectionId); },
    async localReceipt(requestId) {
      if (!isUuid(requestId)) remoteFail('remote-invalid-request');
      const selected = await binding();
      const ledger = await createRequestLedger({ workspace: selected.workspace, connectionId: randomUUID() });
      const raw = await ledger.status(requestId);
      return publicAction(raw.action) ? projectReceipt(raw) : absent(requestId);
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
