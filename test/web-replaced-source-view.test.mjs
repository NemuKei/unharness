import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('replacement notice names only the affected Skill in everyday words', async () => {
  const { replacedSourceHeadline } = await import('../web/src/workbench/replaced-source-view.ts');
  assert.equal(replacedSourceHeadline('Kanary'), '「Kanary」が更新され、フォルダーが入れ替わりました。新しい中身を確認して、登録し直してください。');
});

test('review sheet requires the right confirmations and keeps paths in Details', async t => {
  const { canApplyReplacement } = await import('../web/src/workbench/replaced-source-view.ts');
  const review = { reviewId: 'a'.repeat(64), sourceId: 'skill-' + 'b'.repeat(64), label: 'Kanary', bodyChanged: true,
    body: 'Synthetic revised body', missingPreparedFiles: ['policy'], nextScopeId: 'c'.repeat(64),
    details: { path: '/synthetic/kanary/SKILL.md', previousDirectory: { ino: 1 }, currentDirectory: { ino: 2 }, nextSourceId: 'skill-' + 'd'.repeat(64) } };
  assert.equal(canApplyReplacement(review, true, false), false);
  assert.equal(canApplyReplacement(review, false, true), false);
  assert.equal(canApplyReplacement(review, true, true), true);
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());
  const { ReplacedSourceReviewSheet } = await vite.ssrLoadModule('/src/workbench/ReplacedSourcePanel.tsx');
  const html = renderToStaticMarkup(createElement(ReplacedSourceReviewSheet, { review, preparedMode: 'normal', busy: false,
    confirmedLocation: false, confirmedContent: false, onLocation: () => {}, onContent: () => {}, onApply: () => {}, onClose: () => {} }));
  for (const copy of ['Kanary', '中身が変わりました', '中身を見る', '登録し直す', '詳しく']) assert.match(html, new RegExp(copy));
  assert.match(html, /登録し直す<\/button>/);
  assert.match(html, /disabled=""/);
  assert.ok(html.indexOf('/synthetic/kanary/SKILL.md') > html.indexOf('詳しく'));
  assert.ok(!html.slice(0, html.indexOf('詳しく')).includes('/synthetic/kanary/SKILL.md'));
  assert.match(html, /前のフォルダーにあった設定ファイルが、新しいフォルダーにはありません/);
  assert.match(html, /通常装備の設定を確認し直す必要があります/);
  assert.ok(!html.includes('前に置いた零式の設定'));
  assert.ok(html.indexOf('agents/openai.yaml') > html.indexOf('詳しく'));
  const zero = renderToStaticMarkup(createElement(ReplacedSourceReviewSheet, { review, preparedMode: 'trueform', busy: false,
    confirmedLocation: false, confirmedContent: false, onLocation: () => {}, onContent: () => {}, onApply: () => {}, onClose: () => {} }));
  assert.match(zero, /このSkillが自動で使われる状態に戻っています/);
  const uncertain = renderToStaticMarkup(createElement(ReplacedSourceReviewSheet, { review, preparedMode: 'normal', busy: false, uncertain: true,
    confirmedLocation: true, confirmedContent: true, onLocation: () => {}, onContent: () => {}, onApply: () => {}, onClose: () => {} }));
  assert.match(uncertain, /disabled=""[^>]*>登録し直す<\/button>/);
});

test('a refreshed registration names its last mode and prioritizes re-preparation', async () => {
  const { homeView } = await import('../web/src/workbench/home-view.ts');
  const source = { preparedMode: 'normal', revision: 3, conflict: null, recovery: { pending: false },
    registration: { scopeId: 'a'.repeat(64), modeChangeRequired: true }, setup: { setupId: null } };
  const view = homeView({ source, confirmed: true, busy: false, proposals: [], failure: null });
  assert.equal(view.mode, 'normal');
  assert.equal(view.reprepareMode, 'normal');
  assert.equal(view.notice, null);
  assert.deepEqual(view.switchTargets, []);
  const replaced = homeView({ source: { ...source, conflict: { kind: 'source-replaced' } },
    confirmed: true, busy: false, proposals: [], failure: null });
  assert.equal(replaced.reprepareMode, null);
  assert.equal(replaced.notice, null);
  const first = homeView({ source: { ...source, registration: { ...source.registration, modeChangeRequired: false } },
    confirmed: true, busy: false, proposals: [], failure: null });
  assert.equal(first.notice, '次はAIと零式の中身を決める');
});

test('after re-registration the everyday screen has one Normal re-preparation action', async t => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());
  const { HomeScreen } = await vite.ssrLoadModule('/src/workbench/HomeScreen.tsx');
  const source = { preparedMode: 'normal', revision: 3, conflict: null, recovery: { pending: false },
    registration: { scopeId: 'a'.repeat(64), sources: [], modeChangeRequired: true }, setup: { setupId: null } };
  const controller = { view: { metadata: { contextId: 'b'.repeat(64) }, source }, confirmed: true, busy: false, error: '', errorDetail: '' };
  const html = renderToStaticMarkup(createElement(HomeScreen, { controller, artwork: null,
    onSettings: () => {}, onSupport: () => {}, onResolve: () => {}, blocker: '零式と限定解除の中身がまだ決まっていません' }));
  assert.match(html, /<h1>通常装備<\/h1>/);
  assert.match(html, /準備し直しが必要です/);
  assert.match(html, /通常装備を準備し直してください/);
  assert.match(html, />準備し直す<\/button>/);
  for (const copy of ['零式を準備し直してください', '零式と限定解除の中身がまだ決まっていません', '次はAIと零式の中身を決める'])
    assert.ok(!html.includes(copy), copy);
});

test('release mode with no saved setup offers one consultation instead of a broken switch', async t => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());
  const { HomeScreen } = await vite.ssrLoadModule('/src/workbench/HomeScreen.tsx');
  const source = { preparedMode: 'trueform', revision: 3, conflict: null, recovery: { pending: false },
    registration: { scopeId: 'a'.repeat(64), sources: [], modeChangeRequired: true }, setup: { setupId: null } };
  const controller = { view: { metadata: { contextId: 'b'.repeat(64) }, source }, confirmed: true, busy: false, error: '', errorDetail: '' };
  const html = renderToStaticMarkup(createElement(HomeScreen, { controller, artwork: null,
    onSettings: () => {}, onSupport: () => {}, onResolve: () => {}, blocker: '零式と限定解除の中身がまだ決まっていません' }));
  assert.match(html, /<h1>零式<\/h1>/);
  assert.match(html, /零式を準備し直してください/);
  assert.match(html, />AIと零式の中身を決める<\/button>/);
  assert.ok(!html.includes('零式と限定解除の中身がまだ決まっていません'));
  assert.ok(!html.includes('>準備し直す</button>'));
});

test('the everyday screen shows the affected Skill and review action without a path', async t => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());
  const { HomeScreen } = await vite.ssrLoadModule('/src/workbench/HomeScreen.tsx');
  const source = { preparedMode: 'trueform', revision: 2, conflict: { kind: 'source-replaced', sourceId: 'skill-' + 'a'.repeat(64), label: 'Kanary' },
    recovery: { pending: false }, registration: { scopeId: 'b'.repeat(64), sources: [], modeChangeRequired: false }, setup: { setupId: null } };
  const controller = { view: { metadata: { contextId: 'c'.repeat(64) }, source }, confirmed: true, busy: false, error: '', errorDetail: '' };
  const html = renderToStaticMarkup(createElement(HomeScreen, { controller, artwork: null,
    onSettings: () => {}, onSupport: () => {}, onResolve: () => {}, blocker: 'Generic internal blocker' }));
  assert.match(html, /「Kanary」が更新され、フォルダーが入れ替わりました/);
  assert.match(html, />確認する<\/button>/);
  assert.ok(!html.includes('Generic internal blocker'));
  assert.ok(!html.includes('/synthetic/kanary'));
});
