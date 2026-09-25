import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { applyLoadout } from '../src/workbench/loadout-editor-action.ts';

const id = 'skill-' + 'a'.repeat(64);
const skill = { id, label: 'slide-polisher', description: '文章の仕上げを手伝います。',
  normalState: 'automatic', availableStates: ['manual', 'disabled'], requiredControl: false };

test('1, 2, 5, 7. the editor shows a name, description, all three choices, a disabled reason and AI star; controls stay out', async t => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());
  const { LoadoutChoices } = await vite.ssrLoadModule('/src/workbench/LoadoutEditor.tsx');
  const html = renderToStaticMarkup(createElement(LoadoutChoices, {
    mode: 'trueform', skills: [skill, { ...skill, id: 'skill-' + 'b'.repeat(64), label: '管理Skill', requiredControl: true }],
    choices: { [id]: 'disabled' }, recommendedIds: [id], codexOperations: { read: true, disable: true, enable: false, 'plugin-disable': false },
    onChoice() {},
  }));
  assert.match(html, /slide-polisher/);
  assert.match(html, /文章の仕上げを手伝います/);
  for (const label of ['自動で使う', '呼んだときだけ', '使わない']) assert.match(html, new RegExp(label));
  assert.match(html, /零式は何も足さない構成です/);
  assert.match(html, /★/);
  assert.ok(!html.includes('管理Skill'));
  assert.ok(!html.includes(id));
  const fallback = renderToStaticMarkup(createElement(LoadoutChoices, { mode: 'trueform',
    skills: [{ ...skill, description: null }], choices: { [id]: 'manual' }, recommendedIds: [],
    codexOperations: { read: true, disable: true, enable: true, 'plugin-disable': true }, onChoice() {} }));
  assert.match(fallback, /登録済みのSkillです/);
});

test('6. approval uses review_setup, apply_setup, plan, apply in order and verifies readback', async () => {
  const calls = [], setupId = 'b'.repeat(64), reviewId = 'c'.repeat(64), planId = 'd'.repeat(64);
  const execute = async (action, input) => {
    calls.push([action, input]);
    if (action === 'review-setup') return { status: 'completed', result: { reviewId, sourceFilesChanged: 0 } };
    if (action === 'apply-setup') return { status: 'completed', result: { setupId, adopted: true } };
    if (action === 'plan') return { status: 'completed', result: { planId, mode: 'trueform' } };
    return { status: 'completed', result: { preparedMode: 'trueform', readback: 'matched' } };
  };
  const result = await applyLoadout({ execute, proposal: { schemaVersion: 4 }, mode: 'trueform' });
  assert.equal(result.preparedMode, 'trueform');
  assert.deepEqual(calls.map(([action]) => action), ['review-setup', 'apply-setup', 'plan', 'apply']);
  assert.deepEqual(calls[1][1], { reviewId });
  assert.deepEqual(calls[3][1], { planId });
});

test('6. the confirmation sheet shows named changes and one final approval', async t => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());
  const { LoadoutConfirmation } = await vite.ssrLoadModule('/src/workbench/LoadoutEditor.tsx');
  const html = renderToStaticMarkup(createElement(LoadoutConfirmation, { changes: ['slide-polisher：使わない → 呼んだときだけ'],
    busy: false, onConfirm() {}, onCancel() {} }));
  assert.match(html, /slide-polisher：使わない → 呼んだときだけ/);
  assert.match(html, />保存して切り替える<\/button>/);
  assert.match(html, />やめる<\/button>/);
  assert.equal((html.match(/保存して切り替える<\/button>/g) ?? []).length, 1);
});

test('6. a failed setup step stops the sequence before any mode write', async () => {
  const calls = [], error = new Error('synthetic failure');
  await assert.rejects(applyLoadout({ execute: async action => {
    calls.push(action);
    return action === 'apply-setup' ? { status: 'failed', error }
      : { status: 'completed', result: { reviewId: 'c'.repeat(64), sourceFilesChanged: 0 } };
  }, proposal: { schemaVersion: 4 }, mode: 'trueform' }), error);
  assert.deepEqual(calls, ['review-setup', 'apply-setup']);
});

test('the everyday screen offers manual TRUEFORM selection as its only next step after Normal re-preparation', async t => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());
  const { HomeScreen } = await vite.ssrLoadModule('/src/workbench/HomeScreen.tsx');
  const source = { preparedMode: 'normal', revision: 4, conflict: null, recovery: { pending: false },
    registration: { scopeId: 'a'.repeat(64), sources: [], modeChangeRequired: false }, setup: { setupId: null } };
  const controller = { view: { metadata: { contextId: 'b'.repeat(64) }, source }, confirmed: true, busy: false,
    error: '', errorDetail: '' };
  const html = renderToStaticMarkup(createElement(HomeScreen, { controller, artwork: null,
    onSettings() {}, onSupport() {}, onResolve() {}, blocker: '零式と限定解除の中身がまだ決まっていません' }));
  assert.match(html, /次は零式の中身を選ぶ/);
  assert.match(html, />零式の中身を選ぶ<\/button>/);
  assert.ok(!html.includes('零式と限定解除の中身がまだ決まっていません'));
  assert.ok(!html.includes('次はAIと零式の中身を決める'));
});
