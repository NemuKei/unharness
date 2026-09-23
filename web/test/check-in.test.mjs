import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
const usage = await import('../../src/proposals/usage.mjs').catch(() => ({}));
const { checkInDue } = usage;
const at = '2026-09-24T00:00:00Z';

test('checkInDue triggers at the earlier of three days or five new tasks', () => {
  assert.equal(checkInDue({ addedAt: at, tasksSince: 4, now: '2026-09-26T23:59:59Z' }), false);
  assert.equal(checkInDue({ addedAt: at, tasksSince: 5, now: '2026-09-24T00:01:00Z' }), true);
  assert.equal(checkInDue({ addedAt: at, tasksSince: 0, now: '2026-09-27T00:00:00Z' }), true);
  assert.equal(checkInDue({ addedAt: at, tasksSince: 0, now: '2026-09-24T00:00:00Z' }), false);
});

test('check-in appears only for an unanswered due addition with three clear choices', async t => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());
  const { CheckInCard } = await vite.ssrLoadModule('/src/workbench/CheckInCard.tsx');
  const props = { name: '文章仕上げ', due: true, answered: false, ratio: null,
    onKeep() {}, onRemove() {}, onConsult() {} };
  const html = renderToStaticMarkup(createElement(CheckInCard, props));
  assert.match(html, /文章仕上げ/);
  assert.match(html, /まだ目安がありません/);
  for (const label of ['残す', '外す', 'AIに相談']) assert.match(html, new RegExp(label));
  assert.equal(renderToStaticMarkup(createElement(CheckInCard, { ...props, answered: true })), '');
  assert.equal(renderToStaticMarkup(createElement(CheckInCard, { ...props, due: false })), '');
});
