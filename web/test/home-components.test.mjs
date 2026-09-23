import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

async function components(t) {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());
  return { cards: await vite.ssrLoadModule('/src/workbench/ProposalCard.tsx'),
    sheets: await vite.ssrLoadModule('/src/workbench/SwitchSheet.tsx') };
}

test('proposal card shows everyday reasons and two decisions without exposing record IDs', async t => {
  const { cards } = await components(t);
  const html = renderToStaticMarkup(createElement(cards.ProposalCard, { proposal: {
    proposalId: 'a'.repeat(64), kind: 'add', mode: 'unseal', status: 'pending',
    items: [{ sourceId: 'skill-' + 'b'.repeat(64), reason: '文章の仕上げを試したいからです。' }],
  }, sourceNames: { ['skill-' + 'b'.repeat(64)]: '文章仕上げ' }, onApprove() {}, onDismiss() {}, busy: false }));
  assert.match(html, /文章仕上げ — 文章の仕上げを試したいからです/);
  assert.match(html, /足して試す/);
  assert.match(html, /やめる/);
  assert.ok(!html.includes('skill-'));
  assert.ok(!html.includes('a'.repeat(64)));
  const fallback = renderToStaticMarkup(createElement(cards.ProposalCard, { proposal: {
    proposalId: 'a'.repeat(64), kind: 'add', mode: 'unseal', status: 'pending',
    items: [{ sourceId: 'skill-' + 'b'.repeat(64), reason: '理由です。' }],
  }, sourceNames: {}, onApprove() {}, onDismiss() {}, busy: false }));
  assert.match(fallback, /登録済みの項目 — 理由です/);
  assert.ok(!fallback.includes('skill-'));
});

test('switch sheet is one confirmation with a fresh-task boundary', async t => {
  const { sheets } = await components(t);
  const html = renderToStaticMarkup(createElement(sheets.SwitchSheet, { mode: 'trueform', removed: 4,
    onConfirm() {}, onCancel() {}, busy: false }));
  assert.match(html, /零式にします。外れるもの4件。次の新しいタスクから/);
  assert.match(html, /切り替える/);
  assert.match(html, /やめる/);
});

test('unreadable switch contents use the same failure action and collapsed detail', async t => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());
  const { FailureNotice } = await vite.ssrLoadModule('/src/workbench/FailureNotice.tsx');
  const html = renderToStaticMarkup(createElement(FailureNotice, {
    message: '変更内容を確認できませんでした。', detail: 'mode-contents-unavailable', scopeId: null,
  }));
  assert.match(html, /変更内容を確認できませんでした/);
  assert.match(html, /AIに調べてもらう/);
  assert.match(html, /<details[^>]*><summary>詳しく<\/summary><code>mode-contents-unavailable<\/code><\/details>/);
});
