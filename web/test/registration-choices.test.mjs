import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('registration shows candidate names and everyday explanations; paths and role details stay collapsed', async t => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());
  const { RegistrationChoices } = await vite.ssrLoadModule('/src/workbench/RegistrationChoices.tsx');
  const rows = [
    { id: 'instructions-' + 'a'.repeat(64), label: 'Global Codex instructions', path: '/PRIVATE/codex/AGENTS.md', eligible: true },
    { id: 'skill-' + 'b'.repeat(64), label: '文章仕上げ', description: '文章を読みやすく整えます。', path: '/PRIVATE/skills/writer/SKILL.md', eligible: true },
    { id: 'skill-' + 'c'.repeat(64), label: '資料整理', description: null, eligible: true },
  ];
  const html = renderToStaticMarkup(createElement(RegistrationChoices, { rows, selectedIds: [], checked: false,
    busy: false, onToggle() {}, onChecked() {}, details: createElement('p', null, '/PRIVATE/executable') }));
  const ordinary = html.split('<details')[0];
  assert.match(ordinary, /いつもの追加指示（AGENTS.md）/);
  assert.match(ordinary, /文章仕上げ/);
  assert.match(ordinary, /文章を読みやすく整えます/);
  assert.match(ordinary, /作業に追加している指示/);
  assert.match(ordinary, /Skill/);
  assert.doesNotMatch(ordinary, /Global Codex instructions/);
  assert.match(ordinary, /これは自分で追加したもので、外しても仕事の決まりには影響しません/);
  assert.doesNotMatch(ordinary, /PRIVATE|任意の役割|実行ファイル|保存場所/);
  assert.match(html, /<details/);
  assert.match(html, /PRIVATE/);
});

test('initial setup leads with saving the familiar configuration and an open registration journey', async t => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());
  const { InitialSetupPanel } = await vite.ssrLoadModule('/src/workbench/RegistrationChoices.tsx');
  const html = renderToStaticMarkup(createElement(InitialSetupPanel, null,
    createElement('button', null, '追加設定の候補を確認')));
  assert.match(html, /はじめに：いつもの構成を保存します/);
  assert.match(html, /追加設定の候補を確認/);
  assert.doesNotMatch(html, /1\. 保存内容を見る|2\. AIと相談する|3\. このMacで詳細を確認/);
  assert.ok(html.indexOf('追加設定の候補を確認') < html.indexOf('</section>'));
});
