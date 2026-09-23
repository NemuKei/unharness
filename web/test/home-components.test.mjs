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
  }, onApprove() {}, onDismiss() {}, busy: false }));
  assert.match(html, /文章の仕上げを試したいからです/);
  assert.match(html, /足して試す/);
  assert.match(html, /やめる/);
  assert.ok(!html.includes('skill-'));
  assert.ok(!html.includes('a'.repeat(64)));
});

test('switch sheet is one confirmation with a fresh-task boundary', async t => {
  const { sheets } = await components(t);
  const html = renderToStaticMarkup(createElement(sheets.SwitchSheet, { mode: 'trueform', removed: 4,
    onConfirm() {}, onCancel() {}, busy: false }));
  assert.match(html, /零式にします。外れるもの4件。次の新しいタスクから/);
  assert.match(html, /切り替える/);
  assert.match(html, /やめる/);
});
