import test from 'node:test';
import assert from 'node:assert/strict';
import { modePresentation, modeHeading } from '../web/src/sources.ts';
import { modeBlocker } from '../web/src/mode-blocker.ts';
import { sourceControllerReducer, initialSourceControllerState } from '../web/src/source-controller-state.ts';
import { ApiError } from '../web/src/api.ts';
import { proposalFailureMessage } from '../web/src/workbench/home-view.ts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const internal = ['Normal', '保存待ち', '外部の変更', 'UUID', '操作ID', 'config-', 'source-'];

test('mode names are the concept names with one everyday line each', () => {
  assert.equal(modePresentation.trueform.title, '零式');
  assert.equal(modePresentation.unseal.title, '限定解除');
  assert.equal(modePresentation.normal.title, '通常装備');
  assert.equal(modePresentation.trueform.description, '何も足さない、素のAI。');
  assert.equal(modePresentation.unseal.description, '零式を土台に、選んだ装備だけを解放する。');
  assert.equal(modePresentation.normal.description, '最初に保存した、元の構成。');
});

test('the contents heading leads with the concept name', () => {
  assert.equal(modeHeading('trueform'), '零式（TRUEFORM）');
  assert.equal(modeHeading('normal'), '通常装備（Normal）');
});

test('blocked-switch reasons use everyday words', () => {
  const ready = { busy: false, connected: true, confirmed: true, registered: true, conflict: false, recoveryPending: false, setupRequired: false };
  const cases = [{ busy: true }, { connected: false }, { confirmed: false }, { registered: false }, { recoveryPending: true },
    { conflict: true }, { operationUncertain: true }, { setupRequired: true }];
  for (const flags of cases) {
    const message = modeBlocker({ ...ready, ...flags }, 'trueform').message;
    for (const word of internal) assert.ok(!message.includes(word), `${JSON.stringify(flags)}: ${message}`);
  }
});

test('a failed operation keeps the raw code out of the visible message', () => {
  const next = sourceControllerReducer(initialSourceControllerState, { type: 'failed', error: new ApiError('config-transform-failed') });
  assert.ok(!next.error.includes('config-transform-failed'));
  assert.ok(!next.notice.includes('config-transform-failed'));
  assert.ok(!next.error.includes('外部の変更'));
  assert.equal(next.errorDetail, 'config-transform-failed');
});

test('an unqualified Codex version explains that settings were left unchanged', () => {
  const next = sourceControllerReducer(initialSourceControllerState, { type: 'failed', error: new ApiError('codex-version-unqualified') });
  assert.equal(next.error, 'このCodexの版は、まだ確認していません。今の設定はそのままです');
  assert.equal(next.errorDetail, 'codex-version-unqualified');
  assert.equal(proposalFailureMessage('codex-version-unqualified', null, null), next.error);
});

test('the everyday failure panel offers an AI investigation action for this version', async t => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());
  const { FailureNotice } = await vite.ssrLoadModule('/src/workbench/FailureNotice.tsx');
  const message = proposalFailureMessage('codex-version-unqualified', null, null);
  const html = renderToStaticMarkup(createElement(FailureNotice, { message, detail: 'codex-version-unqualified' }));
  assert.match(html, /このCodexの版は、まだ確認していません。今の設定はそのままです/);
  assert.match(html, /AIに調べてもらう/);
  assert.ok(!html.includes('codex-version-unqualified</p>'));
});

test('an uncertain result still forbids pressing again', () => {
  const next = sourceControllerReducer(initialSourceControllerState, { type: 'failed', error: new ApiError('request-failed', undefined, 'uncertain') });
  assert.match(next.error, /もう一度押さず/);
});
