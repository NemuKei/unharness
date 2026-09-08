import { exactKeys, boundedText, deriveAcceptance } from '../comparisons/assessment.mjs';
import { fail } from '../sources/errors.mjs';
import { validateDeclaration } from './declaration.mjs';
const kind = 'replay-assessment-invalid';
export function assessReplay(value, declaration) {
  declaration = validateDeclaration(declaration);
  exactKeys(value, ['outcome', 'requirements', 'ratings', 'provenance'], ['note'], kind);
  if (!['accepted', 'failed', 'abandoned', 'unknown'].includes(value.outcome) || !['user', 'agent'].includes(value.provenance)) fail(kind);
  const match = (rows, declared) => {
    if (!Array.isArray(rows) || rows.length !== declared.length || new Set(rows.map(r => r?.id)).size !== rows.length
      || rows.some(r => !declared.some(d => d.id === r?.id))) fail(kind);
  };
  match(value.requirements, declaration.requirements); match(value.ratings, declaration.ratings);
  const requirements = declaration.requirements.map(d => {
    const r = value.requirements.find(x => x.id === d.id);
    exactKeys(r, ['id', 'result'], [], kind);
    if (!['pass', 'fail', 'unknown'].includes(r.result)) fail(kind);
    return { ...d, result: r.result };
  });
  const ratings = declaration.ratings.map(d => {
    const r = value.ratings.find(x => x.id === d.id);
    exactKeys(r, ['id', 'score', 'reason'], [], kind);
    if (!(r.score === null || Number.isInteger(r.score) && r.score >= 1 && r.score <= 5)) fail(kind);
    return { ...d, score: r.score, reason: boundedText(r.reason, 500, true, kind) };
  });
  return { outcome: value.outcome, requirements, ratings, provenance: value.provenance,
    ...(Object.hasOwn(value, 'note') ? { note: boundedText(value.note, 2000, true, kind, true) } : {}) };
}
export function replayBudget(declaration, measurement) {
  const budget = declaration.budget, turns = measurement?.selectedTurnIds.length ?? null;
  const tokens = measurement?.usage.totals.totalTokens ?? null;
  const tokenStatus = budget.maxRecordedTokens === null ? 'not-set' : tokens !== null && tokens > budget.maxRecordedTokens ? 'exceeded'
    : tokens === null || measurement.usage.availability !== 'available' ? 'unknown' : 'within';
  const turnStatus = turns === null || turns === 0 ? 'unknown' : turns > budget.maxTurnsPerAttempt ? 'exceeded' : 'within';
  return { status: [tokenStatus, turnStatus].includes('exceeded') ? 'exceeded'
    : [tokenStatus, turnStatus].includes('unknown') ? 'unknown' : 'within-recorded-budget',
    maxTurnsPerAttempt: budget.maxTurnsPerAttempt, recordedTurns: turns, turnStatus,
    maxRecordedTokens: budget.maxRecordedTokens, recordedTokens: tokens, tokenStatus,
    tokenCoverage: 'recorded-root-responses', childCoverage: 'unknown' };
}
export function replayAcceptance(assessment, review) {
  const reported = deriveAcceptance(assessment), reasons = [];
  if (!reported.accepted) reasons.push('requirements-or-reported-outcome');
  if (review.qualification.status !== 'matched-record') reasons.push('replay-not-qualified');
  if (review.sourceIssue !== null) reasons.push('source-condition-unavailable');
  if (review.readIssue !== null) reasons.push('task-record-unavailable');
  if (review.budget.status !== 'within-recorded-budget') reasons.push('recorded-budget-not-met');
  return { ...reported, accepted: reasons.length === 0, reasons };
}
