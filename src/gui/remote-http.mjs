import { createRemoteController } from './remote-controller.mjs';
import { exactRemote, isUuid, remoteError, remoteErrorStatus, remoteFail, remoteHttpPolicy } from './remote-policy.mjs';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_LOCAL_REQUESTS = 1000;
function send(response, status, body, cors = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', ...cors });
  response.end(status === 204 ? undefined : JSON.stringify(body));
}
function failure(response, error, cors) {
  const safe = remoteError(error);
  send(response, remoteErrorStatus(safe.kind), { error: safe }, cors);
}
export async function createRemoteHttp({ controller, enqueue, readJson, now }) {
  const remote = await createRemoteController({ controller, enqueue, now });
  const localRequests = new Map();
  return {
    // Called before the ordinary local API branch. It never falls through to a
    // local controller or returns its raw state, metadata or service result.
    async publicRequest(request, response, url, loopbackOrigin) {
      let cors = {};
      try {
        cors = remoteHttpPolicy(request, { loopbackOrigin, webOrigin: remote.webOrigin });
        const match = /^\/remote\/v1\/(redeem|status|plan|apply|operation-status)$/.exec(url.pathname);
        if (!match || url.search) remoteFail('remote-invalid-request');
        if (request.method === 'OPTIONS') { send(response, 204, null, cors); return; }
        const input = await readJson(request, true, MAX_BODY_BYTES);
        const operation = match[1];
        const auth = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.authorization ?? '');
        if (operation !== 'redeem' && !auth) remoteFail('remote-request-forbidden');
        const result = operation === 'redeem' ? await remote.redeem(input, request.headers.origin)
          : await remote.request(operation, input, { token: auth[1], origin: request.headers.origin });
        send(response, 200, result, cors);
      } catch (error) { failure(response, error, cors); }
    },
    // The caller must complete the existing local Host/origin/client/token
    // checks first. Public sessions cannot issue or approve a connection.
    async localRequest(request, response, url) {
      try {
        const match = /^\/api\/remote\/(issue|approve|revoke|operation-status)$/.exec(url.pathname);
        if (!match || request.method !== 'POST' || url.search) remoteFail('remote-invalid-request');
        const action = match[1], input = await readJson(request, true, MAX_BODY_BYTES);
        const fields = { issue: [], approve: ['pairingId'], revoke: ['connectionId'], 'operation-status': ['operationId'] }[action];
        exactRemote(input, ['requestId', ...fields]);
        if (!isUuid(input.requestId) || fields.some(key => !isUuid(input[key]))) remoteFail('remote-invalid-request');
        const fingerprint = JSON.stringify([action, ...fields.map(key => input[key])]);
        let saved = localRequests.get(input.requestId);
        if (saved && saved.fingerprint !== fingerprint) remoteFail('remote-operation-conflict');
        if (!saved) {
          if (localRequests.size >= MAX_LOCAL_REQUESTS) remoteFail('remote-capacity');
          const execute = async () => {
            try {
              const body = action === 'issue' ? await remote.issue() : action === 'approve' ? await remote.approve(input.pairingId)
                : action === 'revoke' ? remote.revoke(input.connectionId) : await remote.localReceipt(input.operationId);
              return { status: 200, body };
            } catch (error) { const safe = remoteError(error); return { status: remoteErrorStatus(safe.kind), body: { error: safe } }; }
          };
          saved = { fingerprint, result: execute() };
          localRequests.set(input.requestId, saved);
        }
        const result = await saved.result;
        send(response, result.status, result.body);
      } catch (error) { failure(response, error); }
    },
    close: () => remote.close(),
  };
}
