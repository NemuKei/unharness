import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDeclaration } from '../src/experiments/declaration.mjs';
const rules = await import('../src/appearances/comparison-rule.mjs').catch(e => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw e;
});
const rule = { schemaVersion: 1, metric: 'recorded-root-tokens-per-accepted-task',
  baselineSnapshotId: '1'.repeat(64), candidateSnapshotId: '2'.repeat(64),
  attemptsPerLoadout: 3, minimumAcceptedRuns: 2, minimumReductionPercent: 10 };
const declaration = { request: 'Solve the declared task.', requirements: [{ id: 'correct', label: 'Correct result', critical: true }],
  ratings: [], budget: { maxAttempts: 3, maxTurnsPerAttempt: 4, maxRecordedTokens: 20000 } };

test('a saved declaration preserves an explicit rule without adding one to historical declarations', () => {
  assert.deepEqual(validateDeclaration(declaration), declaration);
  assert.deepEqual(validateDeclaration({ ...declaration, comparisonRule: rule }), { ...declaration, comparisonRule: rule });
  assert.equal(Object.hasOwn(validateDeclaration(declaration), 'comparisonRule'), false);
});

test('task-specific rules require two exact distinct versions and bounded predeclared counts and benefit', () => {
  assert.equal(typeof rules.validateComparisonRule, 'function');
  assert.deepEqual(rules.validateComparisonRule(rule, declaration.budget), rule);
  const invalid = [
    { baselineSnapshotId: rule.candidateSnapshotId }, { candidateSnapshotId: '../arbitrary' },
    { attemptsPerLoadout: 0 }, { attemptsPerLoadout: 4 }, { attemptsPerLoadout: 1.5 },
    { minimumAcceptedRuns: 0 }, { minimumAcceptedRuns: 4 }, { minimumReductionPercent: 0 },
    { minimumReductionPercent: 100 }, { minimumReductionPercent: 0.5 }, { metric: 'strength' },
    { schemaVersion: 2 }, { eligible: true }, { seed: '3'.repeat(64) }, { resultIds: [] },
  ];
  for (const update of invalid) assert.throws(() => rules.validateComparisonRule({ ...rule, ...update }, declaration.budget),
    { kind: 'starting-declaration-invalid' });
  assert.throws(() => validateDeclaration({ ...declaration, comparisonRule: null }), { kind: 'starting-declaration-invalid' });
});

test('normalization owns a copy so later input edits cannot mutate a reviewed rule', () => {
  const input = structuredClone({ ...declaration, comparisonRule: rule });
  const reviewed = validateDeclaration(input);
  input.comparisonRule.minimumReductionPercent = 90;
  assert.equal(reviewed.comparisonRule.minimumReductionPercent, 10);
});
