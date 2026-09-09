import test from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';

const controls = await import('../src/setup/control-sources.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const id = digit => 'skill-' + digit.repeat(64);
const root = resolve('test/fixtures/product installation');
const candidate = (key, path, label = 'unharness') => ({
  id: id(key), path, label, enabled: true, eligible: true, reason: null,
  availability: { normal: true, unseal: true, trueform: true },
});
const sources = [
  candidate('a', join(root, 'skills', 'unharness', 'SKILL.md'), 'Management'),
  candidate('b', join(root, 'skills', 'unharness-original', 'SKILL.md'), 'Original artwork'),
  candidate('c', join(root, 'other', 'SKILL.md')),
];

test('the product installation identifies management by its exact source location, not a Skill name', () => {
  assert.equal(typeof controls.requiredControlSources, 'function');
  const required = controls.requiredControlSources(sources, root);
  assert.deepEqual(required.sourceIds, [id('a')]);
  assert.deepEqual(required.fileIds, [id('a') + ':body', id('a') + ':policy', id('a') + ':format']);
});

test('required management sources cannot be selected or rewritten through a release plan', () => {
  assert.equal(typeof controls.assertControlPreserved, 'function');
  const control = controls.requiredControlSources(sources, root);
  for (const request of [
    { selectedIds: [id('a')], changedFileIds: [] },
    { selectedIds: [], changedFileIds: [id('a') + ':policy'] },
    { selectedIds: [], changedFileIds: [id('a') + ':body'] },
  ]) assert.throws(() => controls.assertControlPreserved({ ...request, control }), { kind: 'setup-required-control' });
  assert.doesNotThrow(() => controls.assertControlPreserved({ selectedIds: [id('c')], changedFileIds: ['config'], control }));
});

test('discovery keeps required management visible and enabled without making it a release target', () => {
  assert.equal(typeof controls.retainControlSources, 'function');
  const retained = controls.retainControlSources(sources, root);
  assert.equal(retained[0].enabled, true);
  assert.equal(retained[0].eligible, false);
  assert.equal(retained[0].reason, 'unharness-management-retained');
  assert.deepEqual(retained[0].availability, { normal: false, unseal: false, trueform: false });
  assert.deepEqual(retained.slice(1), sources.slice(1));
  assert.equal(sources[0].eligible, true);
});

test('the write guard checks actual control snapshots even when a plan omits the control from its selection', () => {
  assert.equal(typeof controls.assertControlChanges, 'function');
  const manager = candidate('d', resolve('skills/unharness/SKILL.md'));
  const key = manager.id + ':policy';
  const before = { config: { text: 'retained' }, [key]: { text: 'automatic: true' } };
  const after = structuredClone(before); after[key].text = 'automatic: false';
  assert.throws(() => controls.assertControlChanges({ sources: [manager], before, after }), { kind: 'setup-required-control' });
  assert.throws(() => controls.assertControlChanges({ sources: [manager], before, after: { config: before.config } }), { kind: 'setup-required-control' });
  assert.doesNotThrow(() => controls.assertControlChanges({ sources: [manager], before, after: structuredClone(before) }));
});
