import test from 'node:test';
import assert from 'node:assert/strict';
import * as operations from '../web/src/source-operations.ts';

function fixture() {
  const scope = 'a'.repeat(64), nextScope = 'b'.repeat(64), normal = 'c'.repeat(64), nextNormal = 'd'.repeat(64);
  const metadata = { kind: 'user-sources', application: 'codex', applicationLabel: 'Codex', launchId: 'fixture-launch',
    contextId: 'f'.repeat(64), workspace: '/owned/store', context: { codexHome: '/owned/home', project: '/owned/project', executable: '/owned/codex' } };
  const accepted = { metadata, source: { revision: 3, registration: { scopeId: scope, rootScopeId: scope,
    normalId: normal, activeNormalId: normal, previousScopeIds: [], modeChangeRequired: false } } };
  const review = { reviewId: 'e'.repeat(64), nextScopeId: nextScope };
  const response = { status: 'completed', result: { adopted: true, reviewId: review.reviewId, scopeId: scope,
    nextScopeId: nextScope, nextNormalId: nextNormal, revision: 4, sourceFilesChanged: 0, modeChangeRequired: true },
    state: { metadata: { ...structuredClone(metadata), contextId: '9'.repeat(64) }, source: { revision: 4, conflict: null, recovery: { pending: false },
      registration: { scopeId: nextScope, rootScopeId: scope, normalId: nextNormal, activeNormalId: nextNormal,
        previousScopeIds: [scope], modeChangeRequired: true } } } };
  return { accepted, review, response };
}
const matches = f => operations.reviewedEnrollmentTransition(f.accepted, f.review, f.response);

test('a completed enrollment may accept only its reviewed child scope under the same local context', () => {
  assert.equal(matches(fixture()), true);
});

for (const [name, change] of [
  ['another home', f => { f.response.state.metadata.context.codexHome = '/another/home'; }],
  ['another launch', f => { f.response.state.metadata.launchId = 'another-launch'; }],
  ['an inconsistent unchanged context ID', f => { f.response.state.metadata.contextId = f.accepted.metadata.contextId; }],
  ['another review', f => { f.response.result.reviewId = '0'.repeat(64); }],
  ['unreviewed scope', f => { f.response.state.source.registration.scopeId = '0'.repeat(64); }],
  ['another root', f => { f.response.state.source.registration.rootScopeId = '0'.repeat(64); }],
  ['missing ancestry', f => { f.response.state.source.registration.previousScopeIds = []; }],
  ['a later source revision', f => { f.response.state.source.revision = 5; }],
  ['an unchanged scope', f => { f.review.nextScopeId = f.accepted.source.registration.scopeId; }],
  ['a mismatched Normal', f => { f.response.state.source.registration.activeNormalId = '0'.repeat(64); }],
  ['failed adoption', f => { f.response.result.adopted = false; }],
  ['conflicted current files', f => { f.response.state.source.conflict = { kind: 'source-conflict' }; }],
  ['pending recovery', f => { f.response.state.source.recovery.pending = true; }],
  ['a preflight context switch', f => { f.response.status = 'context-updated'; }],
]) test(`enrollment does not authorize ${name}`, () => {
  const f = fixture(); change(f); assert.equal(matches(f), false);
});
