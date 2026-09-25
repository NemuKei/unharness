import test from 'node:test';
import assert from 'node:assert/strict';
import { homeView } from '../src/workbench/home-view.ts';
import { loadoutChoices, loadoutInitial, loadoutChanges, loadoutPrompt, loadoutProposal } from '../src/workbench/loadout-editor-view.ts';

const id = 'skill-' + 'a'.repeat(64);
const skill = { id, normalState: 'automatic', availableStates: ['manual', 'disabled'], requiredControl: false };
const operations = { read: true, disable: true, enable: true, 'plugin-disable': false };
const sources = [{ id, label: 'slide-polisher', description: '文章の仕上げを手伝います。' }];
const inventory = { inventoryId: 'b'.repeat(64), runtimeVersion: '0.155.0-alpha.16.4', skills: [skill], plugins: [] };
const setup = { scopeId: 'c'.repeat(64), normalId: 'd'.repeat(64), inventory, proposal: null, enrollment: null };

test('1. each ordinary Skill has three daily-language choices', () => {
  const options = loadoutChoices({ mode: 'unseal', skill, trueformState: 'disabled', normalEnabled: true, codexOperations: operations }).options;
  assert.deepEqual(options.map(option => option.state), ['automatic', 'manual', 'disabled']);
  assert.deepEqual(options.map(option => option.label), ['自動で使う', '呼んだときだけ', '使わない']);
});

test('2. TRUEFORM never offers automatic use', () => {
  const options = loadoutChoices({ mode: 'trueform', skill, trueformState: 'manual', normalEnabled: true, codexOperations: operations }).options;
  assert.deepEqual(options.find(option => option.state === 'automatic'),
    { state: 'automatic', label: '自動で使う', enabled: false, reason: '零式は何も足さない構成です' });
});

test('3. UNSEAL cannot lower a Skill below TRUEFORM', () => {
  const options = loadoutChoices({ mode: 'unseal', skill, trueformState: 'manual', normalEnabled: true, codexOperations: operations }).options;
  assert.equal(options.find(option => option.state === 'disabled').enabled, false);
  assert.equal(options.find(option => option.state === 'disabled').reason, '零式より下げることはできません');
});

test('4. a Normal-disabled Skill cannot be enabled by an unqualified Codex operation', () => {
  const disabledNormal = { ...skill, normalState: 'disabled', availableStates: ['manual', 'automatic'] };
  const options = loadoutChoices({ mode: 'unseal', skill: disabledNormal, trueformState: 'disabled', normalEnabled: false,
    codexOperations: { ...operations, enable: false } }).options;
  for (const state of ['automatic', 'manual']) {
    assert.equal(options.find(option => option.state === state).enabled, false);
    assert.equal(options.find(option => option.state === state).reason, 'このCodexの版では、まだ確認していません');
  }
  assert.equal(options.find(option => option.state === 'disabled').enabled, true);
});

test('5. a pending AI recommendation becomes the initial choice and keeps its star', () => {
  const initial = loadoutInitial({ mode: 'trueform', skills: [skill], saved: null,
    proposal: { kind: 'initial', mode: 'trueform', status: 'pending', items: [{ sourceId: id, reason: '外して試します。' }] } });
  assert.equal(initial.choices[id], 'disabled');
  assert.deepEqual(initial.recommendedIds, [id]);
  assert.equal(loadoutInitial({ mode: 'trueform', skills: [skill], saved: null, proposal: null }).choices[id], 'manual');
  const removal = loadoutInitial({ mode: 'unseal', skills: [skill], saved: { [id]: 'automatic' },
    trueform: { [id]: 'disabled' },
    proposal: { kind: 'remove', mode: 'unseal', status: 'pending', items: [{ sourceId: id }] } });
  assert.equal(removal.choices[id], 'disabled');
  assert.deepEqual(removal.recommendedIds, [id]);
});

test('6. one confirmation names each saved-state change before review and apply', () => {
  assert.deepEqual(loadoutChanges({ skills: sources, before: { [id]: 'disabled' }, after: { [id]: 'manual' } }),
    ['slide-polisher：使わない → 呼んだときだけ']);
});

test('7. local choices produce a truthful schema-4 proposal without changing protected or plugin sources', () => {
  const proposal = loadoutProposal({ setup, mode: 'trueform', choices: { [id]: 'disabled' }, sources });
  assert.equal(proposal.schemaVersion, 4);
  assert.equal(proposal.basis.modelSource, 'local-choice');
  assert.equal(proposal.basis.modelId, null);
  assert.deepEqual(proposal.basis.references, []);
  assert.deepEqual(proposal.trueform.skillStates, [{ sourceId: id, state: 'disabled' }]);
  assert.deepEqual(proposal.unseal.skillElevations, []);
  assert.deepEqual(proposal.trueform.retainedOfficialPluginIds, []);
  assert.deepEqual(proposal.roles, [{ sourceId: id, origin: 'user-confirmed', reason: '画面で自分の任意Skillとして確認しました。' }]);
});

test('older saved setups become a new v4 proposal without carrying old selection fields', () => {
  const older = { schemaVersion: 2, roles: [{ sourceId: id, origin: 'self', reason: '保存済み' }],
    trueform: { retainedOfficialPluginIds: [] }, unseal: { instructions: 'minimal', additionalAutomaticSkillIds: [] } };
  const proposal = loadoutProposal({ setup: { ...setup, proposal: older }, mode: 'trueform',
    choices: { [id]: 'manual' }, sources });
  assert.deepEqual(Object.keys(proposal.unseal).sort(), ['additionalPluginIds', 'instructions', 'skillElevations']);
});

test('a manual choice resolves an earlier unknown role without claiming authorship', () => {
  const saved = { schemaVersion: 4, roles: [{ sourceId: id, origin: 'unknown', reason: '以前は未確認' }],
    trueform: { skillStates: [{ sourceId: id, state: 'manual' }], retainedOfficialPluginIds: [] },
    unseal: { instructions: 'minimal', skillElevations: [], additionalPluginIds: [] } };
  const proposal = loadoutProposal({ setup: { ...setup, proposal: saved }, mode: 'trueform',
    choices: { [id]: 'disabled' }, sources });
  assert.deepEqual(proposal.roles, [{ sourceId: id, origin: 'user-confirmed',
    reason: '画面で自分の任意Skillとして確認しました。' }]);
});

test('8. AI consultation includes selected names and states and does not request a setting change', () => {
  const prompt = loadoutPrompt({ mode: 'trueform', skills: sources, choices: { [id]: 'disabled' } });
  assert.match(prompt, /slide-polisher：使わない/);
  assert.match(prompt, /意見/);
  assert.match(prompt, /まだ設定は変えない/);
});

test('after Normal re-preparation only the manual TRUEFORM step is shown', () => {
  const source = { preparedMode: 'normal', revision: 3, conflict: null, recovery: { pending: false },
    registration: { scopeId: setup.scopeId, modeChangeRequired: false }, setup: { setupId: null } };
  const view = homeView({ source, confirmed: true, busy: false, proposals: [], failure: null });
  assert.equal(view.notice, '次は零式の中身を選ぶ');
});

test('a proposal from before a manual save is no longer offered as an initial choice', () => {
  const source = { preparedMode: 'trueform', revision: 8, conflict: null, recovery: { pending: false },
    registration: { scopeId: setup.scopeId, modeChangeRequired: false }, setup: { setupId: 'e'.repeat(64) } };
  const proposal = { proposalId: 'f'.repeat(64), kind: 'initial', mode: 'trueform', status: 'pending',
    basis: { revision: 7 }, items: [{ sourceId: id, reason: '以前の提案' }] };
  assert.equal(homeView({ source, confirmed: true, busy: false, proposals: [proposal], failure: null }).proposal, null);
});
