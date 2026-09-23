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
    { id: 'instructions-' + 'a'.repeat(64), label: '追加した指示', path: '/PRIVATE/codex/AGENTS.md', eligible: true },
    { id: 'skill-' + 'b'.repeat(64), label: '文章仕上げ', path: '/PRIVATE/skills/writer/SKILL.md', eligible: true },
  ];
  const html = renderToStaticMarkup(createElement(RegistrationChoices, { rows, selectedIds: [], checked: false,
    busy: false, onToggle() {}, onChecked() {}, details: createElement('p', null, '/PRIVATE/executable') }));
  const ordinary = html.split('<details')[0];
  assert.match(ordinary, /追加した指示/);
  assert.match(ordinary, /文章仕上げ/);
  assert.match(ordinary, /作業に追加している指示/);
  assert.match(ordinary, /Skill/);
  assert.match(ordinary, /これは自分で追加したもので、外しても仕事の決まりには影響しません/);
  assert.doesNotMatch(ordinary, /PRIVATE|任意の役割|実行ファイル|保存場所/);
  assert.match(html, /<details/);
  assert.match(html, /PRIVATE/);
});
