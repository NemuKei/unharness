import { isDeepStrictEqual } from 'node:util';
import { recordId } from '../core/local-store.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { sumCounters } from '../comparisons/measurement.mjs';
import { openWorkspace } from '../sources/records.mjs';
import { acquire } from '../sources/transaction.mjs';
import { fail } from '../sources/errors.mjs';
import { loadSavedStart, hash } from '../experiments/start-records.mjs';
import { loadReplayIndex } from '../experiments/replay-index.mjs';
import { loadReplayAttempts, replaySourceBinding } from '../experiments/replay-records.mjs';
import { loadReplayResult } from '../experiments/replay-result-records.mjs';
import { assertReplayReviewCurrent } from '../experiments/replay-service.mjs';

const identity = (role, value) => recordId('observation', { role, schemaVersion: 1, ...value });
const group = (snapshotId, attempts, loaded) => {
  const selected = attempts.filter(a => a.review.sourceBinding.snapshotId === snapshotId);
  const results = selected.map(a => loaded.get(a.attemptId)?.summary ?? null);
  const totalTokens = results.some(r => !r) ? null : sumCounters(results.map(r => r.measurement?.usage.totals.totalTokens ?? null));
  const acceptedCount = results.filter(r => r?.acceptance.accepted).length;
  return { snapshotId, attemptCount: selected.length, recordedCount: results.filter(Boolean).length,
    acceptedCount, totalTokens, tokensPerAcceptedTask: totalTokens !== null && acceptedCount > 0 ? totalTokens / acceptedCount : null };
};
const runtime = r => {
  const m = r.measurement;
  return m ? { app: m.app, model: m.conditions.model, runtimeVersion: m.runtimeVersion,
    parserVersion: m.parserVersion, reasoningEffort: m.conditions.reasoningEffort,
    executionPolicyDigest: m.conditions.executionPolicyDigest } : null;
};

// Internal resolver: only canonical, validated records from the selected scope.
// Callers cannot narrow result IDs, omit failed attempts or select old grading.
export async function resolveAppearanceEvidence(w, startId) {
  const saved = await loadSavedStart(w, startId), rule = saved.review.declaration.comparisonRule ?? null;
  const empty = { scopeId: w.scopeId, startId, rule, eligible: false, assessment: 'unknown', achievementId: null,
    context: null, resultIds: [], baseline: null, candidate: null,
    reasons: ['predeclared-comparison-rule-required'], completeIsolationVerified: false,
    coverage: 'recorded-root-responses', childCoverage: 'unknown', memoryInputs: 'uncontrolled' };
  if (saved.review.scopeId !== w.scopeId) return { ...empty, reasons: ['source-scope-changed'] };
  if (!rule) return empty;
  const index = await loadReplayIndex(w), all = await loadReplayAttempts(w, index);
  const attempts = all.filter(a => a.review.startId === startId
    && [rule.baselineSnapshotId, rule.candidateSnapshotId].includes(a.review.sourceBinding.snapshotId));
  const loaded = new Map();
  for (const a of attempts) if (a.phase === 'recorded') loaded.set(a.attemptId, await loadReplayResult(w, a.resultId));
  const results = [...loaded.values()].map(r => r.summary), reasons = [];
  const add = reason => { if (!reasons.includes(reason)) reasons.push(reason); };
  const baseline = group(rule.baselineSnapshotId, attempts, loaded), candidate = group(rule.candidateSnapshotId, attempts, loaded);
  if ([baseline, candidate].some(g => g.attemptCount !== rule.attemptsPerLoadout)) add('observation-count-not-met');
  if (attempts.some(a => a.phase !== 'recorded')) add('incomplete-attempts');
  if (new Set(attempts.map(a => a.review.sourceBinding.normalId)).size > 1) add('normal-versions-differ');
  if (new Set(results.map(r => r.taskId)).size !== results.length) add('overlapping-task-records');
  const intervals = results.map(r => {
    const from = Date.parse(r.measurement?.createdAt);
    const to = Math.max(...(r.measurement?.availableTurns ?? []).map(t => Date.parse(t.completedAt)));
    return Number.isFinite(from) && Number.isFinite(to) && to >= from ? { from, to } : null;
  });
  if (intervals.some(i => i === null)) add('task-timeline-unavailable');
  for (let i = 0; i < intervals.length; i++) for (let j = i + 1; j < intervals.length; j++) {
    const a = intervals[i], b = intervals[j];
    if (a && b && a.from < b.to && b.from < a.to) add('overlapping-task-timelines');
  }
  if (results.some(r => r.qualification.status !== 'matched-record' || r.readIssue || r.sourceIssue || r.files.issue))
    add('unqualified-or-unavailable-records');
  if (results.some(r => r.measurement?.usage.availability !== 'available') || [baseline, candidate].some(g => g.totalTokens === null))
    add('usage-unavailable-or-partial');
  if (results.some(r => r.assessment.outcome === 'unknown' || r.assessment.requirements.some(q => q.result === 'unknown')
    || r.budget.status === 'unknown')) add('quality-evidence-unknown');
  const conditions = results.map(runtime), condition = conditions[0] ?? null;
  const conditionKnown = condition !== null && Object.values(condition).every(v => v !== null)
    && conditions.every(c => isDeepStrictEqual(c, condition))
    && results.every(r => !r.measurement.conditions.unknown.length && !r.measurement.conditions.changes.length);
  if (!conditionKnown) add('runtime-conditions-differ-or-unknown');
  const { title, ...declaration } = saved.review.declaration;
  const taskCriteriaId = identity('appearance-task-basis', { declaration, manifestId: saved.review.manifestId,
    conditions: saved.review.conditions });
  const resultIds = attempts.map(a => loaded.get(a.attemptId)?.summary.resultId).filter(Boolean);
  const evidenceVersion = identity('appearance-evidence-version', { startId,
    attempts: attempts.map(a => ({ attemptId: a.attemptId, stateId: a.stateId, resultId: a.resultId ?? null })) });
  const context = conditionKnown ? { scopeId: w.scopeId, app: condition.app, model: condition.model,
    loadoutId: rule.candidateSnapshotId, taskCriteriaId, baselineId: rule.baselineSnapshotId, evidenceVersion } : null;
  const achievementId = conditionKnown ? identity('appearance-achievement', { scopeId: w.scopeId, taskCriteriaId,
    loadoutId: rule.candidateSnapshotId, baselineId: rule.baselineSnapshotId, conditions: condition }) : null;
  let assessment = 'unknown', eligible = false;
  if (!reasons.length) {
    if (baseline.acceptedCount < rule.minimumAcceptedRuns || baseline.totalTokens === 0) add('baseline-quality-or-usage-insufficient');
    else {
      // Integer cross multiplication keeps percentage boundaries exact even for
      // large safe counters; display ratios are never the decision inputs.
      const left = BigInt(candidate.totalTokens) * BigInt(baseline.acceptedCount) * 100n;
      const base = BigInt(baseline.totalTokens) * BigInt(candidate.acceptedCount);
      const reduction = BigInt(rule.minimumReductionPercent);
      if (candidate.acceptedCount < baseline.acceptedCount) {
        assessment = 'adverse'; add('accepted-work-regressed');
      } else if (candidate.acceptedCount >= rule.minimumAcceptedRuns && left <= base * (100n - reduction)) {
        assessment = 'favorable'; eligible = true;
      } else if (left >= base * (100n + reduction)) {
        assessment = 'adverse'; add('recorded-token-efficiency-regressed');
      } else add('declared-improvement-not-met');
    }
  }
  return { ...empty, eligible, assessment, achievementId, context, resultIds, baseline, candidate, reasons };
}

export async function evaluateUserAppearance(args) {
  exactKeys(args, ['workspace', 'startId'], [], 'invalid-request');
  if (!hash(args.startId)) fail('invalid-request');
  const initial = await openWorkspace(args.workspace), release = await acquire(initial);
  try { return await resolveAppearanceEvidence(await openWorkspace(args.workspace), args.startId); }
  finally { await release(); }
}

export async function assertAppearanceEvidenceCurrent(w, evidence) {
  if (!evidence.context || evidence.context.loadoutId !== w.state.snapshotId) fail('appearance-ineligible');
  let candidate = null;
  for (const resultId of evidence.resultIds) {
    const result = await loadReplayResult(w, resultId);
    if (result.review.attempt.review.sourceBinding.snapshotId === w.state.snapshotId) candidate = result;
  }
  if (!candidate) fail('appearance-ineligible');
  const review = candidate.review.attempt.review, binding = replaySourceBinding(w);
  if (binding.normalId !== review.sourceBinding.normalId) fail('appearance-ineligible');
  // Selecting the same exact configuration later may have a new preparation
  // revision. Verify its bytes, retained inputs and native conditions again;
  // a revision counter alone neither invalidates nor qualifies an achievement.
  try { await assertReplayReviewCurrent(w, { ...review, sourceBinding: binding }); }
  catch { fail('appearance-ineligible'); }
}
