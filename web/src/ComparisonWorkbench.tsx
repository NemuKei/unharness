import { text as t } from './locale.ts';
import { useEffect, useRef, useState } from "react";
import { RecentTaskPicker } from './RecentTaskPicker';
import type { RecentTask } from './RecentTaskPicker';
import { AiRequestButton } from './AiRequestButton';
import { bindChatScope } from './chat-requests';
import './work-records.css';
import { PluginObservationSummary } from './PluginObservationSummary';
import artwork from "../assets/hangar-states-v1.png";
import {
  aggregateReasonLabels,
  conditionEvidence,
  defaultAssessment,
  formatDuration,
  formatNumber,
  historicalMode,
  outcomeLabels,
  provenanceLabels,
  reviewCutoffForTask,
  requirementLabels,
  runReferenceLabel,
  tokenBarPercent,
} from "./comparisons";
import type {
  RunAssessment,
  RunReview,
  SavedRun,
  UsageAvailability,
} from "./comparisons";
import { modePresentation, validTaskId } from "./sources";
import type { SourceMode } from "./sources";
import { comparisonContextKey, useComparisonController } from "./useComparisonController";
import type { useSourceController } from "./useSourceController";
import { OperationStatus } from './workbench/OperationStatus';
import type { OperationKind } from './workbench/OperationStatus';

type SourceController = ReturnType<typeof useSourceController>;

const usageLabels: Record<UsageAvailability, string> = {
  get available() { return t("記録あり", "Recorded"); },
  get partial() { return t("一部のみ", "Partial"); },
  get unavailable() { return t("不明", "Unknown"); },
};

function capturedLabel(value: string) {
  const time = new Date(value);
  return Number.isFinite(time.valueOf())
    ? time.toLocaleString(t("ja-JP", "en-US"))
    : t("日時不明", "Date unknown");
}

function associationLabel(review: RunReview) {
  const association = review.source.association;
  return association
    ? modePresentation[association.preparedMode].title
    : t("モード未確認", "Mode unverified");
}

function SourcePortrait({ review }: { review: RunReview }) {
  const mode = historicalMode(review);
  if (!mode)
    return (
      <div className="comparison-portrait unknown" role="img" aria-label={t("関連する装備は不明", "Associated loadout unknown")}>
        <span aria-hidden="true">?</span>
      </div>
    );
  const positions: Record<SourceMode, string> = {
    normal: "left center",
    unseal: "center center",
    trueform: "right center",
  };
  return (
    <div
      className="comparison-portrait"
      role="img"
      aria-label={t(`${modePresentation[mode].title}の履歴上の装備`, `Historical ${modePresentation[mode].title} loadout`)}
      style={{ backgroundImage: `url(${artwork})`, backgroundPosition: positions[mode] }}
    />
  );
}

function ReviewSummary({ review }: { review: RunReview }) {
  const measurement = review.measurement;
  const conditions = conditionEvidence(measurement.conditions);
  return (
    <section className="comparison-panel review-summary" aria-labelledby="review-summary-heading">
      <div className="comparison-heading">
        <div>
          <p className="eyebrow">{t("通常利用の記録", "Ordinary-use record")}</p>
          <h2 id="review-summary-heading">{t("観測した内容", "Observed contents")}</h2>
        </div>
        <span className="neutral-badge">{t("観測記録", "Observation")}</span>
      </div>
      <div className="review-overview">
        <SourcePortrait review={review} />
        <dl>
          <div><dt>{t("履歴上の装備", "Historical loadout")}</dt><dd>{associationLabel(review)}</dd></div>
          <div><dt>{t("選択した完了位置", "Selected completion point")}</dt><dd>{measurement.selectedTurnIds.length} {t(" ターン目まで", " turns included")}</dd></div>
          <div><dt>{t("ルート応答のトークン", "Root-response tokens")}</dt><dd>{formatNumber(measurement.usage.totals.totalTokens)}{measurement.usage.availability === "partial" ? t("（一部のみ）", " (partial)") : ""}</dd></div>
          <div><dt>{t("記録された実行時間", "Recorded elapsed time")}</dt><dd>{formatDuration(measurement.time.recordedTurnDurationMs)}</dd></div>
          <div><dt>{t("最初の応答まで", "Time to first response")}</dt><dd>{formatDuration(measurement.time.firstResponseMs)}</dd></div>
          <div><dt>{t("使用量の状態", "Usage availability")}</dt><dd>{usageLabels[measurement.usage.availability]}</dd></div>
          <div><dt>{t("評価時期", "Assessment timing")}</dt><dd>{t("後から付ける評価", "Retrospective assessment")}</dd></div>
        </dl>
      </div>
      <p className="comparison-boundary">
        {t("使用量は記録されたルート応答だけです。子タスク、全体の完全性、ツール、メモリ入力、開始時の依頼とファイルは不明です。", "Usage covers recorded root responses only. Child tasks, completeness, tools, memory input, and the initial request and files are unknown.")}</p>
      {review.source.observation && <PluginObservationSummary evidence={review.source.observation} />}
      <details>
        <summary>{t("条件・収集範囲・問題の詳細", "Conditions, collection scope and issues")}</summary>
        <dl className="comparison-details">
          <div><dt>{t("最初のモデル", "Initial model")}</dt><dd>{conditions.initialModel}</dd></div>
          <div><dt>{t("最初の推論設定", "Initial reasoning setting")}</dt><dd>{conditions.initialReasoningEffort}</dd></div>
          <div><dt>{t("最初の実行ポリシー", "Initial execution policy")}</dt><dd>{conditions.initialExecutionPolicy}</dd></div>
          <div><dt>{t("途中で変化した条件", "Conditions changed during work")}</dt><dd>{conditions.changed}</dd></div>
          <div><dt>{t("不明な条件", "Unknown conditions")}</dt><dd>{conditions.unknown}</dd></div>
          <div><dt>{t("実行環境", "Execution environment")}</dt><dd>{t("不明（収集環境とは別）", "Unknown (separate from collection environment)")}</dd></div>
          <div><dt>{t("収集環境", "Collection environment")}</dt><dd>{review.collectedOn.platform} / {review.collectedOn.architecture} / Node {review.collectedOn.nodeVersion}</dd></div>
          <div><dt>{t("ソース関連", "Source association")}</dt><dd>{review.source.association ? t("最初のターンだけ一致", "First turn matched only") : review.source.issue ?? review.source.observation?.status ?? t("不明", "Unknown")}</dd></div>
          <div><dt>{t("入力トークン", "Input tokens")}</dt><dd>{formatNumber(measurement.usage.totals.inputTokens)}</dd></div>
          <div><dt>{t("キャッシュ入力", "Cached input")}</dt><dd>{formatNumber(measurement.usage.totals.cachedInputTokens)}</dd></div>
          <div><dt>{t("キャッシュ書込入力", "Cache-write input")}</dt><dd>{formatNumber(measurement.usage.totals.cacheWriteInputTokens)}</dd></div>
          <div><dt>{t("出力トークン", "Output tokens")}</dt><dd>{formatNumber(measurement.usage.totals.outputTokens)}</dd></div>
          <div><dt>{t("推論出力トークン", "Reasoning output tokens")}</dt><dd>{formatNumber(measurement.usage.totals.reasoningOutputTokens)}</dd></div>
          <div><dt>{t("記録したルート応答", "Recorded root responses")}</dt><dd>{measurement.usage.responseCount}{t("件（重複 ", " (duplicates: ")}{measurement.usage.duplicateCount}{t("件、除外 ", "; excluded: ")}{measurement.usage.excludedCount}{t("件）", ")")}</dd></div>
          <div><dt>{t("最終thread累積値", "Final thread cumulative value")}</dt><dd>{formatNumber(measurement.usage.finalReportedThreadTotals.totalTokens)}{t("（構成は不明）", " (composition unknown)")}</dd></div>
        </dl>
        {(measurement.issues.length > 0 || measurement.usage.reasons.length > 0) && (
          <p className="muted">{t("記録上の理由：", "Recorded reasons: ")}{[...measurement.issues, ...measurement.usage.reasons].join("、")}</p>
        )}
      </details>
    </section>
  );
}

function AssessmentEditor({
  review,
  correction,
  disabled,
  onSave,
  initialTitle,
}: {
  review: RunReview;
  correction: SavedRun | null;
  disabled: boolean;
  onSave: (value: { title?: string; assessment: RunAssessment }) => void;
  initialTitle?: string;
}) {
  const [title, setTitle] = useState("");
  const [assessment, setAssessment] = useState<RunAssessment>(defaultAssessment);
  useEffect(() => {
    setTitle(correction?.title ?? initialTitle ?? "");
    setAssessment(
      correction
        ? structuredClone(correction.assessment)
        : structuredClone(defaultAssessment),
    );
  }, [correction?.runId, review.reviewId, initialTitle]);
  const canSave =
    title.length <= 120 &&
    assessment.requirements.every((row) => row.label.trim()) &&
    assessment.ratings.every(
      (row) =>
        row.label.trim() &&
        row.lowAnchor.trim() &&
        row.highAnchor.trim() &&
        row.reason.trim(),
    );
  return (
    <section className="comparison-panel" aria-labelledby="assessment-heading">
      <div className="comparison-heading">
        <div>
          <p className="eyebrow">{t("評価を付ける", "Add an assessment")}</p>
          <h2 id="assessment-heading">{correction ? t("訂正版を保存", "Save a revision") : t("記録を保存", "Save record")}</h2>
        </div>
        <span>{provenanceLabels[assessment.provenance]}</span>
      </div>
      <div className="comparison-form-grid">
        <label>{t("仕事の名前", "Work title")}<input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>{t("この結果は使えましたか？", "Was the result useful?")}<select value={assessment.outcome} onChange={(event) => setAssessment((old) => ({ ...old, outcome: event.target.value as RunAssessment["outcome"] }))}>{Object.entries(outcomeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      </div>
      <details className="assessment-advanced"><summary>{t('詳しい評価を残す（任意）', 'Add detailed criteria (optional)')}</summary>
      <label>{t("評価した人", "Assessed by")}<select value={assessment.provenance} onChange={(event) => setAssessment((old) => ({ ...old, provenance: event.target.value as RunAssessment["provenance"] }))}>{Object.entries(provenanceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <div className="assessment-group">
        <div className="comparison-heading"><h3>{t("要件チェック", "Requirement checks")}</h3><button className="text-button" type="button" disabled={assessment.requirements.length >= 24} onClick={() => setAssessment((old) => ({ ...old, requirements: [...old.requirements, { id: `requirement-${crypto.randomUUID().slice(0, 8)}`, label: "", critical: false, result: "unknown" }] }))}>{t("要件を追加", "Add a requirement")}</button></div>
        {assessment.requirements.map((row, index) => (
          <div className="assessment-row" key={row.id}>
            <input aria-label={t(`要件 ${index + 1}`, `Requirement ${index + 1}`)} placeholder={t("確認した要件", "Reviewed requirement")} maxLength={160} value={row.label} onChange={(event) => setAssessment((old) => ({ ...old, requirements: old.requirements.map((item) => item.id === row.id ? { ...item, label: event.target.value } : item) }))} />
            <label className="inline-check"><input type="checkbox" checked={row.critical} onChange={(event) => setAssessment((old) => ({ ...old, requirements: old.requirements.map((item) => item.id === row.id ? { ...item, critical: event.target.checked } : item) }))} />{t("必須", "Required")}</label>
            <select aria-label={t(`要件 ${index + 1} の結果`, `Requirement ${index + 1} result`)} value={row.result} onChange={(event) => setAssessment((old) => ({ ...old, requirements: old.requirements.map((item) => item.id === row.id ? { ...item, result: event.target.value as typeof row.result } : item) }))}>{Object.entries(requirementLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
            <button type="button" className="text-button" onClick={() => setAssessment((old) => ({ ...old, requirements: old.requirements.filter((item) => item.id !== row.id) }))}>{t("削除", "Remove")}</button>
          </div>
        ))}
        {!assessment.requirements.length && <p className="muted">{t("要件が空の採用は、本人の申告だけとして記録されます。", "Acceptance with no requirements is recorded as self-reported only.")}</p>}
      </div>
      <div className="assessment-group">
        <div className="comparison-heading"><h3>{t("基準別の評価", "Assessment by criterion")}</h3><button className="text-button" type="button" disabled={assessment.ratings.length >= 8} onClick={() => setAssessment((old) => ({ ...old, ratings: [...old.ratings, { id: `rating-${crypto.randomUUID().slice(0, 8)}`, label: "", score: 3, lowAnchor: "", highAnchor: "", reason: "" }] }))}>{t("評価を追加", "Add assessment")}</button></div>
        {assessment.ratings.map((row, index) => (
          <div className="rating-row" key={row.id}>
            <input aria-label={t(`評価基準 ${index + 1}`, `Criterion ${index + 1}`)} placeholder={t("基準名", "Criterion name")} maxLength={160} value={row.label} onChange={(event) => setAssessment((old) => ({ ...old, ratings: old.ratings.map((item) => item.id === row.id ? { ...item, label: event.target.value } : item) }))} />
            <label>{t("点数", "Score")}<select value={row.score} onChange={(event) => setAssessment((old) => ({ ...old, ratings: old.ratings.map((item) => item.id === row.id ? { ...item, score: Number(event.target.value) } : item) }))}>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}</select></label>
            <input aria-label={t(`評価基準 ${index + 1} の低い基準`, `Criterion ${index + 1} low-score description`)} placeholder={t("1点の基準", "Description for 1 point")} maxLength={160} value={row.lowAnchor} onChange={(event) => setAssessment((old) => ({ ...old, ratings: old.ratings.map((item) => item.id === row.id ? { ...item, lowAnchor: event.target.value } : item) }))} />
            <input aria-label={t(`評価基準 ${index + 1} の高い基準`, `Criterion ${index + 1} high-score description`)} placeholder={t("5点の基準", "Description for 5 points")} maxLength={160} value={row.highAnchor} onChange={(event) => setAssessment((old) => ({ ...old, ratings: old.ratings.map((item) => item.id === row.id ? { ...item, highAnchor: event.target.value } : item) }))} />
            <textarea aria-label={t(`評価基準 ${index + 1} の理由`, `Criterion ${index + 1} reason`)} placeholder={t("この点数の理由", "Reason for this score")} maxLength={500} value={row.reason} onChange={(event) => setAssessment((old) => ({ ...old, ratings: old.ratings.map((item) => item.id === row.id ? { ...item, reason: event.target.value } : item) }))} />
            <button type="button" className="text-button" onClick={() => setAssessment((old) => ({ ...old, ratings: old.ratings.filter((item) => item.id !== row.id) }))}>{t("削除", "Remove")}</button>
          </div>
        ))}
      </div>
      </details>
      <label className="comparison-note">{t("手直しや使い心地のひとこと（任意）", "A note on edits or how it felt (optional)")}<textarea maxLength={2000} value={assessment.note ?? ""} onChange={(event) => setAssessment((old) => ({ ...old, note: event.target.value }))} /></label>
      <button className="primary comparison-primary" disabled={disabled || !canSave} onClick={() => onSave({ ...(title.trim() ? { title: title.trim() } : {}), assessment })}>{correction ? t("訂正版を保存", "Save a revision") : t("この記録を保存", "Save this record")}</button>
      <p className="muted">{t("評価はユーザーまたはAIに帰属する後付けの記録です。自動採点や総合品質点ではありません。", "Assessments are retrospective records attributed to the user or AI, without automatic grading or an overall quality score.")}</p>
    </section>
  );
}

function ComparisonTable({ runs, detailed = false }: { runs: SavedRun[]; detailed?: boolean }) {
  const rows: Array<[string, (run: SavedRun) => string]> = detailed ? [
    [t("結果", "Result"), (run) => outcomeLabels[run.assessment.outcome]],
    [t("算入された採用", "Counted acceptance"), (run) => run.acceptance.accepted ? t("はい", "Yes") : t("いいえ", "No")],
    [t("ルート応答トークン", "Root-response tokens"), (run) => `${formatNumber(run.measurement.usage.totals.totalTokens)}${run.measurement.usage.availability === "partial" ? t("（一部）", " (partial)") : ""}`],
    [t("入力トークン", "Input tokens"), (run) => formatNumber(run.measurement.usage.totals.inputTokens)],
    [t("キャッシュ入力", "Cached input"), (run) => formatNumber(run.measurement.usage.totals.cachedInputTokens)],
    [t("キャッシュ書込入力", "Cache-write input"), (run) => formatNumber(run.measurement.usage.totals.cacheWriteInputTokens)],
    [t("出力トークン", "Output tokens"), (run) => formatNumber(run.measurement.usage.totals.outputTokens)],
    [t("推論出力トークン", "Reasoning output tokens"), (run) => formatNumber(run.measurement.usage.totals.reasoningOutputTokens)],
    [t("記録された実行時間", "Recorded elapsed time"), (run) => formatDuration(run.measurement.time.recordedTurnDurationMs)],
    [t("最初の応答まで", "Time to first response"), (run) => formatDuration(run.measurement.time.firstResponseMs)],
    [t("ルート応答数", "Root-response count"), (run) => formatNumber(run.measurement.usage.responseCount)],
    [t("選択ターン", "Selected turn"), (run) => String(run.measurement.selectedTurnIds.length)],
    [t("最初のモデル", "Initial model"), (run) => conditionEvidence(run.measurement.conditions).initialModel],
    [t("最初の推論設定", "Initial reasoning setting"), (run) => conditionEvidence(run.measurement.conditions).initialReasoningEffort],
    [t("最初の実行ポリシー", "Initial execution policy"), (run) => conditionEvidence(run.measurement.conditions).initialExecutionPolicy],
    [t("途中で変化した条件", "Conditions changed during work"), (run) => conditionEvidence(run.measurement.conditions).changed],
    [t("不明な条件", "Unknown conditions"), (run) => conditionEvidence(run.measurement.conditions).unknown],
    [t("評価者", "Assessor"), (run) => provenanceLabels[run.assessment.provenance]],
    [t("ソース範囲", "Source scope"), (run) => run.source.association ? t("最初のターンだけ", "First turn only") : t("関連不明", "Association unknown")],
  ] : [
    [t('結果', 'Result'), run => outcomeLabels[run.assessment.outcome] + (run.assessment.provenance === 'agent' ? t('（AIの評価）', ' (AI assessment)') : '')],
    [t('手直し・使い心地', 'Edits and experience'), run => run.assessment.note || t('まだ未記録', 'Not recorded yet')],
    [t('開始時のモード', 'Initial mode'), associationLabel],
    [t('開始時のモデル', 'Initial model'), run => conditionEvidence(run.measurement.conditions).initialModel],
    [t('記録された時間', 'Recorded time'), run => formatDuration(run.measurement.time.recordedTurnDurationMs)],
    [t('記録された使用量', 'Recorded usage'), run => `${formatNumber(run.measurement.usage.totals.totalTokens)}${run.measurement.usage.totals.totalTokens === null ? '' : ' tokens'}${run.measurement.usage.availability === 'partial' ? t('（一部のみ）', ' (partial)') : ''}`],
  ];
  return (
    <div className={`comparison-table-scroll${detailed ? '' : ' work-comparison'}`} data-record-count={runs.length} tabIndex={0} aria-label={t("保存記録の比較表", "Saved-record comparison")}>
      <table className="comparison-table">
        <thead><tr><th scope="col">{t("項目", "Metric")}</th>{runs.map((run) => <th scope="col" key={run.runId}>{detailed && <SourcePortrait review={run} />}<strong>{run.title ?? t("名称なし", "Untitled")}</strong><span>{capturedLabel(run.capturedAt)}</span></th>)}</tr></thead>
        <tbody>{rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th>{runs.map((run) => <td key={run.runId}>{value(run)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function TokenBars({ runs }: { runs: SavedRun[] }) {
  const known = runs.map((run) => run.measurement.usage.totals.totalTokens).filter((value): value is number => value !== null);
  const maximum = Math.max(0, ...known);
  return (
    <figure className="token-chart" aria-labelledby="token-chart-title">
      <figcaption id="token-chart-title">{t("記録されたルート応答トークン", "Recorded root-response tokens")}</figcaption>
      {runs.map((run) => {
        const value = run.measurement.usage.totals.totalTokens;
        const width = tokenBarPercent(value, maximum);
        return <div className={`token-row ${run.measurement.usage.availability}`} key={run.runId}><span className="token-name">{run.title ?? associationLabel(run)}</span><div className="token-track" aria-hidden="true">{width !== null && <span className="token-mark" style={{ width: `${width}%` }} />}</div><strong>{formatNumber(value)}{run.measurement.usage.availability === "partial" ? t("（一部）", " (partial)") : ""}</strong></div>;
      })}
      <p className="muted">{t("すべてゼロから同じ最大値までの比率です。短い棒は優劣を表しません。数値と比較表が代替情報です。", "All bars share a zero baseline and maximum. Shorter bars do not indicate superiority. Numbers and the table provide the same information.")}</p>
    </figure>
  );
}

function WorkFacts({ review }: { review: RunReview }) {
  const measurement = review.measurement;
  return <div className="work-facts-block"><dl className="work-facts">
    <div><dt>{t('開始時のモード', 'Initial mode')}</dt><dd>{associationLabel(review)}</dd></div>
    <div><dt>{t('開始時のモデル', 'Initial model')}</dt><dd>{conditionEvidence(measurement.conditions).initialModel}</dd></div>
    <div><dt>{t('記録された時間', 'Recorded time')}</dt><dd>{formatDuration(measurement.time.recordedTurnDurationMs)}</dd></div>
    <div><dt>{t('記録された使用量', 'Recorded usage')}</dt><dd>{formatNumber(measurement.usage.totals.totalTokens)}{measurement.usage.totals.totalTokens !== null && ' tokens'}{measurement.usage.availability === 'partial' && t('（一部のみ）', ' (partial)')}</dd></div>
  </dl><p className="muted">{t('使用量は記録された応答のみです。作業者の手間は、ひとことメモで残せます。', 'Usage covers recorded responses only. Use your note to describe your own effort.')}</p></div>;
}

function recordRequest() {
  return t('この仕事をUnharnessに記録してください。statusで登録範囲を確認し、この記録依頼より前の完了済みの仕事をreview_runで確認してください。タスクの特定にはlist_recent_tasksを使えます。対象が曖昧なら仕事名だけ確認し、UUIDを私に探させないでください。記録のやり取り自体を元の仕事の時間や使用量に含めないでください。結果や使い心地で不足することだけを短く尋ね、記録された値と評価の出所を保ってsave_runで保存し、保存した仕事名を教えてください。モード変更や別モードへの再実行は行わないでください。', 'Record this work in Unharness. Check the registered scope with status and use review_run for completed work before this recording request. list_recent_tasks can identify the task; if ambiguous, ask for its name rather than its UUID. Exclude the recording conversation from the original work measurements. Ask only for missing outcome or experience notes, preserve recorded values and assessment attribution, save with save_run and confirm the saved work title. Do not change modes or replay the task. Please guide me in English.');
}

export function ComparisonWorkbench({ sourceController, taskHandoff }: {
  sourceController: SourceController; taskHandoff?: Readonly<{ taskId: string }>;
}) {
  const comparison = useComparisonController(sourceController);
  const { state } = comparison;
  const [pendingOperation, setPendingOperation] = useState<OperationKind | null>(null);
  const operationGeneration = useRef(0);
  const localContextKey = comparisonContextKey(sourceController.view), previousLocalContext = useRef(localContextKey);
  useEffect(() => {
    if (previousLocalContext.current === localContextKey) return;
    previousLocalContext.current = localContextKey;
    ++operationGeneration.current; setPendingOperation(null);
    setAdding(false); setChoosingTask(true); setOpenedRunId(null); setTaskId(''); setTaskTitle(''); setThroughTurnId(''); setFavoriteNames({});
  }, [localContextKey]);
  const [adding, setAdding] = useState(false), [choosingTask, setChoosingTask] = useState(true);
  const [taskId, setTaskId] = useState(taskHandoff?.taskId ?? ''), [taskTitle, setTaskTitle] = useState('');
  const [throughTurnId, setThroughTurnId] = useState('');
  const [openedRunId, setOpenedRunId] = useState<string | null>(null);
  const [favoriteNames, setFavoriteNames] = useState<Record<string, string>>({});
  const results = useRef<HTMLElement>(null);
  const library = useRef<HTMLElement>(null);
  const openedRun = state.runs.find(run => run.runId === openedRunId) ?? null;
  const sourceReady = !!state.context && !!sourceController.view?.source;
  const recordedTaskIds = new Set(state.runs.map(run => run.measurement.taskId));
  useEffect(() => {
    if (!taskHandoff) return;
    setAdding(true); setChoosingTask(false); setOpenedRunId(null);
    setTaskId(taskHandoff.taskId); setTaskTitle(''); setThroughTurnId('');
    comparison.clearReview();
    void perform('review', () => comparison.reviewRun(taskHandoff.taskId, undefined, true));
  }, [taskHandoff]);
  useEffect(() => { setThroughTurnId(state.review?.measurement.throughTurnId ?? ''); }, [state.review?.reviewId]);
  useEffect(() => {
    if ((openedRun || state.comparison) && results.current?.getClientRects().length)
      results.current.scrollIntoView({ block: 'start' });
  }, [openedRunId, state.comparison]);
  function openRun(run: SavedRun) {
    setAdding(false); setOpenedRunId(run.runId);
    comparison.selectRuns([]);
  }
  function chooseTask(task: RecentTask) {
    const saved = state.runs.find(run => run.measurement.taskId === task.taskId);
    if (saved) { openRun(saved); return; }
    setTaskId(task.taskId); setTaskTitle(task.title ?? ''); setThroughTurnId('');
    setChoosingTask(false); setOpenedRunId(null); comparison.clearReview();
    void perform('review', () => comparison.reviewRun(task.taskId, undefined, true));
  }
  function addRecord() {
    setAdding(true); setChoosingTask(!state.review); setOpenedRunId(null);
    comparison.selectRuns([]);
  }
  async function saveRecord(value: { title?: string; assessment: RunAssessment }) {
    const saved = await perform('save', () => comparison.saveRun(value));
    if (saved) {
      comparison.clearReview(); comparison.selectRuns([]);
      setAdding(false); setOpenedRunId(saved.runId);
    }
  }
  async function perform<T>(kind: OperationKind, action: () => Promise<T>) {
    const generation = ++operationGeneration.current;
    setPendingOperation(kind);
    try { return await action(); }
    finally { if (operationGeneration.current === generation) setPendingOperation(null); }
  }
  function revise(run: SavedRun) {
    setAdding(true); setChoosingTask(false); setOpenedRunId(null); setTaskTitle(run.title ?? '');
    comparison.beginCorrection(run);
  }
  const recordActions = (run: SavedRun) => <details className="record-actions"><summary>{t('記録の詳細・訂正', 'Details and revisions')}</summary>
    <div className="run-actions"><button className="text-button" disabled={sourceController.busy} onClick={() => revise(run)}>{t('評価を訂正', 'Revise assessment')}</button>
      <button className="text-button" disabled={sourceController.busy} onClick={() => void perform('output', () => comparison.readOutput(run.runId))}>{t('回答を開く', 'Read the answer')}</button></div>
    {run.source.association && <div className="record-favorite"><label>{t('お気に入りの名前（任意）', 'Favorite name (optional)')}<input maxLength={120} value={favoriteNames[run.runId] ?? ''} onChange={event => setFavoriteNames(old => ({ ...old, [run.runId]: event.target.value }))}/></label>
      <button className="secondary" disabled={sourceController.busy} onClick={() => void perform('favorite', () => comparison.saveFavorite(run.runId, favoriteNames[run.runId]?.trim() || undefined))}>{t('この記録の装備を保存', 'Save this recorded loadout')}</button></div>}
    {run.scopeId !== sourceController.view?.source?.registration.scopeId && <p className="muted">{t('登録した指示・Skillの範囲を変更する前の記録です。', 'This record predates the current registered instruction and Skill scope.')}</p>}
    <ReviewSummary review={run}/>
    <p>{provenanceLabels[run.assessment.provenance]}</p>
    <ul>{run.assessment.requirements.map(item => <li key={item.id}>{item.label}：{requirementLabels[item.result]}{item.critical && t('（必須）', ' (required)')}</li>)}</ul>
    {run.assessment.ratings.map(item => <p key={item.id}>{item.label} {item.score}/5（{item.lowAnchor}〜{item.highAnchor}）：{item.reason}</p>)}
    {run.previousRunId && <p className="muted">{t('以前の評価を残した訂正版です。元の記録も一覧から開けます。', 'This is a revision. The previous assessment is retained in the list.')}</p>}
  </details>;
  return <div className="comparison-workbench work-records">
    <header className="record-hero"><div><p className="eyebrow">{t('記録・比較', 'WORK RECORDS')}</p><h1>{t('仕事の記録', 'Your work')}</h1>
      <p>{t('1件を振り返る。気になる2件を並べる。自分に合う装備を見つけましょう。', 'Reflect on one job or put two side by side. Find the loadout that suits your work.')}</p></div>
      <button className="primary" disabled={!sourceReady || sourceController.busy} onClick={addRecord}>{t('仕事を記録する', 'Record work')}</button></header>
    <OperationStatus kind={pendingOperation}/>
    {!sourceReady && <section className="comparison-panel">{!sourceController.confirmed || sourceController.view?.source
      ? <p role="status">{t('このMacの記録を確認しています…', 'Checking the records on this Mac…')}</p>
      : <><h2>{t('まず、いつもの装備を保存します', 'Save your usual loadout first')}</h2><p>{t('「設定」で対象を確認してNormalを保存すると、仕事の記録を残せます。', 'Review the targets and save Normal in Settings, then start recording work.')}</p></>}</section>}
    {sourceReady && <>
      <div>
        <section className="comparison-panel record-add" hidden={!adding} aria-label={t('仕事を記録する', 'Record work')}>
          <div className="comparison-heading"><h2>{t('どの仕事を記録しますか？', 'Which work would you like to record?')}</h2>
            <button className="text-button" onClick={() => setAdding(false)}>{t('閉じる', 'Close')}</button></div>
          <RecentTaskPicker controller={sourceController} visible={adding && choosingTask} recordedTaskIds={recordedTaskIds} onChoose={chooseTask}/>
          {!choosingTask && <div className="chosen-task"><strong>{taskTitle || state.correctionRun?.title || t('選んだタスク', 'Selected task')}</strong>
            <button className="text-button" disabled={sourceController.busy} onClick={() => { setChoosingTask(true); comparison.clearReview(); }}>{t('別のタスクを選ぶ', 'Choose another task')}</button></div>}
          {!choosingTask && !state.review && sourceController.busy && <p role="status">{t('選んだ仕事の完了範囲を確認しています…', 'Reviewing the completed work…')}</p>}
          {state.review && !choosingTask && <><WorkFacts review={state.review}/><AssessmentEditor review={state.review} correction={state.correctionRun} initialTitle={taskTitle} disabled={sourceController.busy || !!state.uncertainOperation} onSave={value => void saveRecord(value)}/>
            <details className="record-measurement"><summary>{t('計測範囲と条件を確認', 'Check measurement scope and conditions')}</summary><ReviewSummary review={state.review}/></details></>}
          <details className="manual-record"><summary>{t('別の方法で記録する', 'Other ways to record')}</summary>
            <p>{t('仕事を終えたチャットで「この仕事を記録して」と頼むこともできます。', 'You can also ask “record this work” in the chat where you finished it.')}</p>
            <AiRequestButton label={t('記録用の依頼文をコピー', 'Copy a recording request')} prompt={bindChatScope(recordRequest(), sourceController.view?.source?.registration.scopeId)}/>
            <details><summary>{t('タスクIDを自分で指定する', 'Enter a task ID manually')}</summary>
              <div className="review-form"><label>{t('タスクUUID', 'Task UUID')}<input autoComplete="off" spellCheck={false} disabled={sourceController.busy} value={taskId} aria-invalid={taskId.length > 0 && !validTaskId(taskId)} onChange={event => { comparison.clearReview(); setTaskId(event.target.value); setTaskTitle(''); setThroughTurnId(''); }}/></label>
                <button className="secondary" disabled={sourceController.busy || !validTaskId(taskId)} onClick={() => { setChoosingTask(false); void perform('review', () => comparison.reviewRun(taskId.trim(), undefined, true)); }}>{t('完了した範囲を確認', 'Review completed work')}</button></div>
            </details>
            {state.review && <div className="review-form"><label>{t('記録する完了位置', 'Completion point to record')}<select disabled={sourceController.busy} value={throughTurnId} onChange={event => setThroughTurnId(event.target.value)}>{state.review.measurement.availableTurns.map(turn => <option key={turn.turnId} value={turn.turnId}>{turn.ordinal}{t('ターン目 · ', ' turn · ')}{turn.completed ? t('完了', 'Complete') : t('未完了', 'Incomplete')}</option>)}</select></label>
              <button className="secondary" disabled={sourceController.busy} onClick={() => void perform('review', () => comparison.reviewRun(state.review!.measurement.taskId, reviewCutoffForTask(state.review, state.review!.measurement.taskId, throughTurnId)))}>{t('この範囲で読み直す', 'Review this range')}</button></div>}
          </details>
        </section>
        <section ref={library} className="record-library" aria-label={t('保存した仕事', 'Saved work')}>
          <div className="comparison-heading"><h2>{t('保存した仕事', 'Saved work')}</h2><button className="text-button" disabled={sourceController.busy} onClick={() => void perform('history', () => comparison.loadRuns())}>{t('更新', 'Refresh')}</button></div>
          {!state.historyLoaded && !state.error && !state.backgroundError && <p role="status">{t('保存した仕事を確認しています…', 'Loading saved work…')}</p>}
          {state.historyLoaded && !state.runs.length && <div className="record-empty"><h3>{t('まずは、1件の仕事から。', 'Start with one job.')}</h3><p>{t('「仕事を記録する」から最近のタスクを選び、使えたかどうかを残せます。比較相手は、あとから選べます。', 'Choose a recent task with Record work and note whether it was useful. You can choose a comparison later.')}</p></div>}
          <ul className="record-list">{state.runs.map(run => {
            const selected = state.selectedRunIds.includes(run.runId), title = run.title ?? t('名称なし', 'Untitled');
            return <li key={run.runId}><div className="record-list-row"><input className="record-checkbox" type="checkbox" aria-label={t(`${title}を比較に追加`, `Compare ${title}`)} checked={selected} disabled={sourceController.busy || (!selected && state.selectedRunIds.length >= 3)} onChange={event => { setOpenedRunId(null); comparison.selectRuns(event.target.checked ? [...state.selectedRunIds, run.runId] : state.selectedRunIds.filter(id => id !== run.runId)); }}/>
              <button className="record-open" onClick={() => openRun(run)}><strong>{title}</strong><span>{capturedLabel(run.capturedAt)} · {associationLabel(run)}</span><span className="record-outcome">{outcomeLabels[run.assessment.outcome]}{run.assessment.provenance === 'agent' && t('（AIの評価）', ' (AI assessment)')}{run.previousRunId && t(' · 訂正版', ' · Revised')}</span></button></div>
              {run.assessment.note && <p className="record-excerpt">{run.assessment.note}</p>}</li>;
          })}</ul>
          {state.cursor && <button className="text-button" disabled={sourceController.busy} onClick={() => void comparison.loadRuns(state.cursor!)}>{t('ほかの記録も見る', 'Load more records')}</button>}
          {!!state.runs.length && <div className="record-compare-bar"><p>{state.selectedRunIds.length < 2 ? t('2件選ぶと、並べて見られます。', 'Choose two records to see them side by side.') : t(`${state.selectedRunIds.length}件を選択中`, `${state.selectedRunIds.length} records selected`)}</p>
            <button className="primary" disabled={sourceController.busy || state.selectedRunIds.length < 2} onClick={() => { setOpenedRunId(null); void perform('compare', () => comparison.compareRuns()); }}>{state.selectedRunIds.length >= 2 ? t(`${state.selectedRunIds.length}件を並べて見る`, `Compare ${state.selectedRunIds.length} records`) : t('並べて見る', 'Compare records')}</button></div>}
        </section>
        {(openedRun || state.comparison) && <section ref={results} className="comparison-panel record-results" aria-label={t('記録を見る', 'Review records')}>
          <div className="comparison-heading"><h2>{openedRun ? openedRun.title ?? t('この仕事の記録', 'Work record') : t('仕事を並べて振り返る', 'Review work side by side')}</h2>
            <button className="text-button" onClick={() => { setOpenedRunId(null); comparison.selectRuns([]); library.current?.scrollIntoView({ block: 'start' }); }}>{t('一覧に戻る', 'Back to the list')}</button></div>
          {openedRun ? <><p className="record-result-outcome">{outcomeLabels[openedRun.assessment.outcome]} <small>{provenanceLabels[openedRun.assessment.provenance]}</small></p><p className="record-note">{openedRun.assessment.note || t('手直しや使い心地のメモは、まだありません。', 'No note on edits or experience yet.')}</p><WorkFacts review={openedRun}/>{recordActions(openedRun)}</>
            : state.comparison && <><p className="comparison-reference">{t('仕事や条件の違いを含む参考比較です。数値だけでモードの優劣は決められません。', 'A reference comparison across different work and conditions. Numbers alone do not rank modes.')}</p><ComparisonTable runs={state.comparison.runs}/>
              <p className="muted">{t('使用量は記録された応答のみです。時間は、手直しの手間を表すものではありません。', 'Usage covers recorded responses only. Elapsed time does not measure your editing effort.')}</p>
              <details className="record-measurement"><summary>{t('詳しい計測値と集計', 'Detailed measurements and aggregates')}</summary><ComparisonTable runs={state.comparison.runs} detailed/><TokenBars runs={state.comparison.runs}/>
                <dl className="aggregate-summary"><div><dt>{t('記録数', 'Records')}</dt><dd>{state.comparison.aggregate.recordCount}</dd></div><div><dt>{t('合計トークン', 'Total tokens')}</dt><dd>{formatNumber(state.comparison.aggregate.totalTokens)}</dd></div><div><dt>{t('採用版1件あたり', 'Per accepted version')}</dt><dd>{formatNumber(state.comparison.aggregate.tokensPerAcceptedRun)}</dd></div></dl>
                {[...state.comparison.aggregate.reasons, ...state.comparison.reasons].map(reason => <p key={reason}>{aggregateReasonLabels[reason] ?? reason}</p>)}</details>
              {state.comparison.runs.map(run => <div className="compared-record-details" key={run.runId}><h3>{run.title ?? associationLabel(run)}</h3>{recordActions(run)}</div>)}</>}
        </section>}
        {state.output && <section className="comparison-panel explicit-output" aria-labelledby="output-heading"><div className="comparison-heading"><h2 id="output-heading">{t('開いた回答', 'Opened answer')}</h2><code>{runReferenceLabel(state.output.runId, state.runs)}</code></div>{state.output.available && state.output.text !== null ? <pre>{state.output.text}</pre> : <p>{t('この回答は取得できません。', 'This answer is unavailable.')}</p>}</section>}
        {state.notice && <p className="comparison-notice" role="status" aria-live="polite">{state.notice}</p>}
        {state.backgroundError && <p className="comparison-error" role="alert">{state.backgroundError}</p>}
        {state.error && <div className="comparison-error" role="alert">{state.error}{state.uncertainOperation && <p>{t('同じ保存操作を自動では繰り返しません。', 'The same save operation is not retried automatically.')}</p>}</div>}
      </div>
    </>}
  </div>;
}
