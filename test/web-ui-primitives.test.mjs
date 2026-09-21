import test from 'node:test';
import assert from 'node:assert/strict';
import { savedModeIsPrepared } from '../web/src/workbench/mode-preparation.ts';

const id = value => value.repeat(64);
const source = (overrides = {}) => ({
  preparedMode: 'trueform', conflict: null, recovery: { pending: false }, registration: { modeChangeRequired: false },
  setup: { setupId: id('a'), preparedSetupId: id('a'), setupRequired: false }, ...overrides,
});

test('a mode card is prepared only when its saved setup matches the prepared setup', () => {
  assert.equal(savedModeIsPrepared(source(), true, 'trueform'), true);
  assert.equal(savedModeIsPrepared(source({ setup: { setupId: id('b'), preparedSetupId: id('a'), setupRequired: false } }), true, 'trueform'), false);
  assert.equal(savedModeIsPrepared(source({ registration: { modeChangeRequired: true } }), true, 'trueform'), false);
  assert.equal(savedModeIsPrepared(source({ conflict: { kind: 'source-conflict' } }), true, 'trueform'), false);
  assert.equal(savedModeIsPrepared(source({ setup: undefined }), true, 'trueform'), true, 'legacy modes retain their original mode-only evidence');
  assert.equal(savedModeIsPrepared(source({ preparedMode: 'normal', setup: undefined }), true, 'normal'), true);
});
