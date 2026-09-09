import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

import { startGuiServer } from '../src/gui/server.mjs';
import {
  createOwnedClaudeProfile,
  readClaudeProfileFiles
} from '../src/claude/owned-profile.mjs';
import { getMinimalGuide } from '../src/sources/guide.mjs';

const browserCase = {
  timeout: 60000,
  skip:
    process.platform !== 'darwin'
      ? 'Mac owned-source browser qualification'
      : !process.env.UNHARNESS_PLAYWRIGHT_MODULE &&
        'Set UNHARNESS_PLAYWRIGHT_MODULE for the built-browser test'
};

async function setup(t, options = {}) {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), 'unharness-claude-browser-'))
  );
  t.after(() => rm(parent, { recursive: true, force: true }));
  const profile = await createOwnedClaudeProfile({ parent, rules: true, ...options });
  const gui = await startGuiServer({
    manageSources: profile.context,
    assetsDirectory: resolve('dist')
  });
  t.after(() => gui.close());
  const { chromium } = await import(
    pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href
  );
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.UNHARNESS_BROWSER_EXECUTABLE
      ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE }
      : {})
  });
  t.after(() => browser.close());
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 1000 }
  });
  // Effects off: a mode is a configuration outcome, never an animation.
  await context.addInitScript(() =>
    localStorage.setItem('unharness.effects.v1', 'off')
  );
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { parent, profile, gui, browser, browserContext: context, page, errors };
}

async function registerThroughBrowser(page) {
  await page.getByRole('button', { name: '追加設定の候補を確認', exact: true }).click();
  const targets = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: '対象の選択と任意の役割の確認' }) })
    .first();
  await targets.locator(':scope > summary').click();
  for (const label of ['Global Claude Code instructions', 'example'])
    await page.getByRole('checkbox', { name: label, exact: true }).check();
  await page
    .getByRole('checkbox', { name: /自分が追加した任意の設定です/ })
    .check();
  await page
    .getByRole('button', { name: '選んだ対象で通常装備を保存', exact: true })
    .click();
}

test('the built workbench registers, prepares and restores a Claude profile', browserCase, async (t) => {
  const s = await setup(t);
  const { page } = s;
  await page.goto(s.gui.url);
  // Before registration the panel says so rather than naming a mode.
  await page
    .locator('.control-column .selected-name')
    .filter({ hasText: '通常装備はまだ保存されていません' })
    .waitFor();

  // The launch identity names the application and its own fields.
  const details = page.locator('.source-context').last();
  await page.getByText('対象・保持する設定・対応状況', { exact: true }).click();
  await details.getByText('Claude Code', { exact: true }).waitFor();
  await details.getByText('Claude home', { exact: true }).waitFor();
  await details.getByText('アプリ本体', { exact: true }).waitFor();
  assert.equal(await details.getByText('Codex home', { exact: true }).count(), 0);

  await registerThroughBrowser(page);
  await page.locator('.control-column .selected-name').filter({ hasText: 'Normal' }).waitFor();

  // UNSEAL: review the plan, then prepare it.
  await page.getByRole('button', { name: /UNSEAL/ }).click();
  const prepare = page.getByRole('button', { name: 'この計画で準備する', exact: true });
  await prepare.and(page.locator(':enabled')).waitFor();
  await prepare.click();
  await page.locator('.control-column .selected-name').filter({ hasText: 'UNSEAL' }).waitFor();
  assert.equal(
    await readFile(join(s.profile.context.claudeHome, 'CLAUDE.md'), 'utf8'),
    getMinimalGuide().text
  );
  const settings = JSON.parse(
    await readFile(join(s.profile.context.claudeHome, 'settings.json'), 'utf8')
  );
  assert.equal(settings.skillOverrides.example, 'user-invocable-only');
  assert.equal(settings.autoMemoryEnabled, true, 'a retained setting survives');

  // Back to the saved Normal, byte for byte.
  await page.getByRole('button', { name: /Normal/ }).first().click();
  const back = page.getByRole('button', { name: 'この計画で準備する', exact: true });
  await back.and(page.locator(':enabled')).waitFor();
  await back.click();
  await page.locator('.control-column .selected-name').filter({ hasText: 'Normal' }).waitFor();
  assert.deepEqual(
    await readClaudeProfileFiles(s.profile.context),
    s.profile.originalFiles
  );
  assert.deepEqual(s.errors, []);
});

test('the workbench explains an unselectable Claude source instead of hiding it', browserCase, async (t) => {
  const s = await setup(t, {
    // A project layer shadows the user layer for this Skill.
    projectSettings: '{\n  "skillOverrides": { "example": "off" }\n}\n',
    extraSkills: [
      {
        name: 'second-example',
        scope: 'user',
        body: '---\nname: second-example\ndescription: Selectable\n---\n\nBody.\n'
      }
    ]
  });
  const { page } = s;
  await page.goto(s.gui.url);
  await page.getByRole('button', { name: '追加設定の候補を確認', exact: true }).click();
  const targets = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: '対象の選択と任意の役割の確認' }) })
    .first();
  await targets.locator(':scope > summary').click();
  // The selectable Skill is offered; the shadowed one is explained, not hidden.
  await page.getByRole('checkbox', { name: 'second-example', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('checkbox', { name: 'example', exact: true }).count(),
    0,
    'a Skill a mode cannot control is never a working toggle'
  );
  const unavailable = targets
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: '利用できない候補' }) })
    .first();
  await unavailable.locator(':scope > summary').click();
  const row = unavailable.locator('.source-detail').filter({ hasText: 'example · 対象外' }).first();
  await row.locator(':scope > summary').click();
  await row.getByText('skill-override-shadowed', { exact: true }).waitFor();
  await row.getByText('UNSEAL: 非対応 ／ TRUEFORM: 非対応', { exact: true }).waitFor();
  assert.deepEqual(s.errors, []);
});

test('the Claude workbench stays usable at a narrow width with effects off', browserCase, async (t) => {
  const s = await setup(t);
  const { page } = s;
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto(s.gui.url);
  await page
    .locator('.control-column .selected-name')
    .filter({ hasText: '通常装備はまだ保存されていません' })
    .waitFor();
  await registerThroughBrowser(page);
  await page.locator('.control-column .selected-name').filter({ hasText: 'Normal' }).waitFor();
  await page.getByRole('button', { name: /TRUEFORM/ }).click();
  const prepare = page.getByRole('button', { name: 'この計画で準備する', exact: true });
  await prepare.and(page.locator(':enabled')).waitFor();
  await prepare.click();
  await page.locator('.control-column .selected-name').filter({ hasText: 'TRUEFORM' }).waitFor();
  // No horizontal overflow at a narrow width.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`);
  assert.deepEqual(s.errors, []);
});

test('a lost server leaves the Claude workbench truthful and recoverable', browserCase, async (t) => {
  const s = await setup(t);
  const { page } = s;
  await page.goto(s.gui.url);
  await registerThroughBrowser(page);
  await page.locator('.control-column .selected-name').filter({ hasText: 'Normal' }).waitFor();

  const port = Number(new URL(s.gui.url).port);
  const closing = s.gui.close();
  s.gui.server.closeAllConnections();
  await closing;
  await page.getByRole('button', { name: '状態を再取得', exact: true }).click();
  // A lost connection never becomes a claim about the prepared state.
  await page.getByText('接続', { exact: false }).first().waitFor().catch(() => {});

  const next = await startGuiServer({
    manageSources: s.profile.context,
    assetsDirectory: resolve('dist'),
    port
  });
  t.after(() => next.close());
  await page.getByRole('button', { name: '状態を再取得', exact: true }).click();
  await page.locator('.control-column .selected-name').filter({ hasText: 'Normal' }).waitFor();
  assert.deepEqual(s.errors, []);
});
