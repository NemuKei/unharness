import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('saved v4 guidance is labelled separately and rendered as text without changing legacy summaries', async t => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());
  const { SavedSetupSummary, readableSetup } = await vite.ssrLoadModule('/src/SavedSetupSummary.tsx');
  const id = 'skill-' + 'a'.repeat(64);
  const preset = { instructionStyle: 'none', skillStates: [{ id, enabled: true, manualOnly: true }], pluginStates: [] };
  const data = { scopeId: 'b'.repeat(64), normalId: 'c'.repeat(64), setupId: 'd'.repeat(64),
    review: { schemaVersion: 4, inheritance: { inheritedPluginIds: [], additionalPluginIds: [], skillElevations: [] },
      presets: { trueform: preset, unseal: { ...preset, instructionStyle: 'custom', customInstructions: '<script>unsafe()</script>\nUser-approved text' } } },
    inventory: null, inventoryError: null };
  assert.equal(readableSetup(data), true);
  const html = renderToStaticMarkup(createElement(SavedSetupSummary, { data, sources: [{ id, label: 'Example' }] }));
  assert.match(html, /保存した追加指示/);
  assert.ok(html.includes('&lt;script&gt;unsafe()&lt;/script&gt;'));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /User-approved text/);
  for (const schemaVersion of [3, 2]) {
    const legacy = structuredClone(data); legacy.review.schemaVersion = schemaVersion;
    assert.equal(readableSetup(legacy), false);
  }
  const wrongMode = structuredClone(data); wrongMode.review.presets.trueform = data.review.presets.unseal;
  assert.equal(readableSetup(wrongMode), false);
  const missing = structuredClone(data); delete missing.review.presets.unseal.customInstructions;
  assert.equal(readableSetup(missing), false);
  const old = structuredClone(data); old.review.schemaVersion = 3;
  old.review.presets.unseal = { ...preset, instructionStyle: 'minimal' };
  assert.equal(readableSetup(old), true);
  const previous = renderToStaticMarkup(createElement(SavedSetupSummary, { data: old, sources: [{ id, label: 'Example' }] }));
  assert.match(previous, /固定の最小ガイド/);
  assert.doesNotMatch(previous, /User-approved text/);
});
