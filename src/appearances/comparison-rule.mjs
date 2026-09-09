import { exactKeys } from '../comparisons/assessment.mjs';
import { fail } from '../sources/errors.mjs';

const kind = 'starting-declaration-invalid';
const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
export function validateComparisonRule(value, budget) {
  exactKeys(value, ['schemaVersion', 'metric', 'baselineSnapshotId', 'candidateSnapshotId',
    'attemptsPerLoadout', 'minimumAcceptedRuns', 'minimumReductionPercent'], [], kind);
  if (value.schemaVersion !== 1 || value.metric !== 'recorded-root-tokens-per-accepted-task'
    || !hash(value.baselineSnapshotId) || !hash(value.candidateSnapshotId)
    || value.baselineSnapshotId === value.candidateSnapshotId
    || !Number.isInteger(value.attemptsPerLoadout) || value.attemptsPerLoadout < 1
    || value.attemptsPerLoadout > 20 || value.attemptsPerLoadout > budget.maxAttempts
    || !Number.isInteger(value.minimumAcceptedRuns) || value.minimumAcceptedRuns < 1
    || value.minimumAcceptedRuns > value.attemptsPerLoadout
    || !Number.isInteger(value.minimumReductionPercent) || value.minimumReductionPercent < 1
    || value.minimumReductionPercent > 99) fail(kind);
  return { ...value };
}
