import test from 'node:test';
import assert from 'node:assert/strict';
import { modeBlocker } from '../web/src/mode-blocker.ts';

const ready = { busy: false, connected: true, confirmed: true, registered: true, conflict: false, recoveryPending: false, setupRequired: false };

test('unknown connection and state never become an initial-registration claim', () => {
  assert.equal(modeBlocker({ ...ready, connected: false, confirmed: false, registered: false }, 'normal').kind, 'connect');
  assert.equal(modeBlocker({ ...ready, confirmed: false, registered: false }, 'normal').kind, 'refresh');
  assert.equal(modeBlocker({ ...ready, registered: false }, 'normal').kind, 'initial');
});
test('required setup leaves Normal recovery available and unresolved operations block each mode', () => {
  assert.equal(modeBlocker({ ...ready, setupRequired: true }, 'normal'), null);
  for (const mode of ['unseal', 'trueform']) assert.equal(modeBlocker({ ...ready, setupRequired: true }, mode).kind, 'settings');
  for (const mode of ['normal', 'unseal', 'trueform']) {
    assert.equal(modeBlocker(ready, mode), null);
    for (const [flag, kind] of [['busy', 'busy'], ['conflict', 'changes'], ['recoveryPending', 'recovery'], ['operationUncertain', 'operation']]) {
      const result = modeBlocker({ ...ready, [flag]: true }, mode);
      assert.equal(result.kind, kind); assert.ok(result.message.length > 0);
    }
  }
  assert.equal(modeBlocker({ ...ready, conflict: true, recoveryPending: true }, 'normal').kind, 'recovery');
});

test('a capable source can review a mode through a shared-file mismatch while recovery and uncertain results still stop it', () => {
  const candidate = { ...ready, conflict: true, modePlanningAvailable: true };
  for (const mode of ['normal', 'unseal', 'trueform']) {
    assert.equal(modeBlocker(candidate, mode), null);
    assert.equal(modeBlocker({ ...candidate, recoveryPending: true }, mode).kind, 'recovery');
    assert.equal(modeBlocker({ ...candidate, operationUncertain: true }, mode).kind, 'operation');
    assert.equal(modeBlocker({ ...candidate, modePlanningAvailable: false }, mode).kind, 'changes');
  }
});
