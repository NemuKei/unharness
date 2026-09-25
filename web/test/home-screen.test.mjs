import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceControllerReducer, initialSourceControllerState } from '../src/source-controller-state.ts';
import { ApiError } from '../src/api.ts';

const home = await import('../src/workbench/home-view.ts').catch(() => ({}));
const { homeView, modeChoice, consultationCopy, restoreHint, savedDetailsVisible,
  switchSheetText, modeForAction, failureAfterRefresh, proposalFailureMessage, removedCount, usageDisplay } = home;
const source = (overrides = {}) => ({ preparedMode: 'trueform', revision: 7, setup: { setupId: 'a'.repeat(64) },
  registration: { scopeId: 'b'.repeat(64) }, conflict: null, recovery: { pending: false }, ...overrides });
const input = (overrides = {}) => ({ source: source(), confirmed: true, busy: false, proposals: [], failure: null, ...overrides });

test('1. everyday choices are only trueform and unseal; Normal is reached through restore', () => {
  assert.deepEqual(homeView(input()), { mode: 'trueform', proposal: null,
    switchTargets: ['trueform', 'unseal'], canRestore: true, notice: null, reprepareMode: null });
  assert.equal(modeForAction('restore'), 'normal');
});

test('2. confirmation names the count and fresh task without claiming a switch occurred', () => {
  assert.equal(switchSheetText('trueform', 4), '零式にします。外れるもの4件。次の新しいタスクから');
  assert.equal(switchSheetText('unseal', 0), '限定解除にします。外れるもの0件。次の新しいタスクから');
  assert.equal(modeForAction('trueform'), 'trueform');
  const contents = { modes: {
    normal: { available: true, instructions: { style: 'saved' }, skills: [{ id: 'a', state: 'automatic' }] },
    trueform: { available: true, instructions: { style: 'none' }, skills: [{ id: 'a', state: 'manual' }] },
  } };
  assert.equal(removedCount(contents, 'normal', 'trueform'), 2);
  assert.equal(removedCount(null, 'normal', 'trueform'), null);
});

test('3. UNSEAL without saved setup invites an AI consultation instead of switching', () => {
  assert.equal(modeChoice(source({ setup: { setupId: null } }), 'unseal'), 'consult');
  assert.equal(modeChoice(source({ setup: { setupId: null } }), 'trueform'), 'consult');
  assert.equal(modeChoice(source(), 'unseal'), 'switch');
  assert.equal(modeChoice(source(), 'trueform'), 'switch');
  const trueform = consultationCopy('trueform');
  assert.equal(trueform.label, 'AIと零式の中身を決める');
  assert.match(trueform.prompt, /外すもの/);
  assert.match(trueform.prompt, /理由/);
  assert.match(trueform.prompt, /まだ設定は変えない/);
});

test('4. failure appears once and unchanged is said only after matched readback', () => {
  const failed = sourceControllerReducer(initialSourceControllerState, { type: 'failed', error: new ApiError('config-transform-failed') });
  assert.ok(failed.error);
  assert.equal(failed.notice, '');
  const before = source(), same = source();
  const checked = failureAfterRefresh(before, same);
  assert.match(checked, /設定は変わっていません/);
  assert.match(failureAfterRefresh(before, source({ revision: 8 })), /状況が変わりました/);
  assert.doesNotMatch(failureAfterRefresh(before, source({ revision: 8 })), /設定は変わっていません/);
  assert.doesNotMatch(failureAfterRefresh(before, source({ conflict: { kind: 'source-conflict' } })), /設定は変わっていません/);
  assert.doesNotMatch(failureAfterRefresh(before, null), /設定は変わっていません/);
  assert.equal(homeView(input({ failure: checked })).notice, checked);
  assert.equal(proposalFailureMessage('proposal-stale', before, same), '状況が変わりました。AIにもう一度聞いてください。');
});

test('5. restore selects Normal through the same local plan and apply journey', () => {
  assert.equal(modeForAction('restore'), 'normal');
  assert.equal(homeView(input({ source: source({ preparedMode: 'normal' }) })).canRestore, false);
  assert.equal(restoreHint(source({ preparedMode: 'normal' })), '今は元の構成です');
  assert.equal(homeView(input({ source: source({ preparedMode: 'unseal' }) })).canRestore, true);
  assert.equal(homeView(input({ source: source({ recovery: { pending: true } }) })).canRestore, false);
  assert.equal(homeView(input({ confirmed: false })).canRestore, false);
  assert.equal(homeView(input({ source: source({ conflict: { kind: 'source-conflict' }, modePlanningAvailable: true }) })).canRestore, true);
});

test('saved-configuration details exist only after Normal has been saved', () => {
  assert.equal(savedDetailsVisible(null), false);
  assert.equal(savedDetailsVisible(source()), true);
});

test('after registration the next action is to decide TRUEFORM with AI', () => {
  const view = homeView(input({ source: source({ preparedMode: 'normal', setup: { setupId: null } }) }));
  assert.match(view.notice, /AIと零式の中身を決める/);
});

test('usage leads with an in-app ratio and keeps absolute counts in details', () => {
  const data = { byMode: { normal: { tasks: 1, perTask: 150000 }, trueform: { tasks: 2, perTask: 100000 },
    unseal: { tasks: 2, perTask: 130000 } },
    ratioToTrueform: { normal: 1.5, trueform: 1, unseal: 1.3 }, availability: 'complete' };
  const display = usageDisplay(data);
  assert.match(display.message, /限定解除は零式に比べて約1.3倍/);
  assert.ok(!display.message.includes('130,000'));
  assert.ok(display.details.some(row => row.includes('130,000')));
  assert.equal(usageDisplay(null).message, 'まだ目安がありません');
  assert.equal(usageDisplay({ ...data, byMode: { ...data.byMode, trueform: { tasks: 0, perTask: null } },
    ratioToTrueform: { normal: null, trueform: null, unseal: null }, availability: 'none' }).message, 'まだ目安がありません');
});
