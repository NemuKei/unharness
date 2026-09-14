import { text as t } from './locale.ts';
import { useEffect, useState } from "react";
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
import { useComparisonController } from "./useComparisonController";
import type { useSourceController } from "./useSourceController";
import { StartingConditions } from "./StartingConditions";
import { ReplayWorkbench } from "./ReplayWorkbench";
import { useReplayController } from "./useReplayController";

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
    : t("関連する装備は不明", "Associated loadout unknown");
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
}: {
  review: RunReview;
  correction: SavedRun | null;
  disabled: boolean;
  onSave: (value: { title?: string; assessment: RunAssessment }) => void;
}) {
  const [title, setTitle] = useState("");
  const [assessment, setAssessment] = useState<RunAssessment>(defaultAssessment);
  useEffect(() => {
    setTitle(correction?.title ?? "");
    setAssessment(
      correction
        ? structuredClone(correction.assessment)
        : structuredClone(defaultAssessment),
    );
  }, [correction?.runId, review.reviewId]);
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
        <span>{t("元の測定は変更しません", "Original measurements stay unchanged")}</span>
      </div>
      <div className="comparison-form-grid">
        <label>{t("任意のタイトル", "Optional title")}<input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>{t("結果", "Result")}<select value={assessment.outcome} onChange={(event) => setAssessment((old) => ({ ...old, outcome: event.target.value as RunAssessment["outcome"] }))}>{Object.entries(outcomeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>{t("評価した人", "Assessed by")}<select value={assessment.provenance} onChange={(event) => setAssessment((old) => ({ ...old, provenance: event.target.value as RunAssessment["provenance"] }))}>{Object.entries(provenanceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      </div>
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
      <label className="comparison-note">{t("補足", "Notes")}<textarea maxLength={2000} value={assessment.note ?? ""} onChange={(event) => setAssessment((old) => ({ ...old, note: event.target.value }))} /></label>
      <button className="primary comparison-primary" disabled={disabled || !canSave} onClick={() => onSave({ ...(title.trim() ? { title: title.trim() } : {}), assessment })}>{correction ? t("訂正版を保存", "Save a revision") : t("この評価で保存", "Save this assessment")}</button>
      <p className="muted">{t("評価はユーザーまたはAIに帰属する後付けの記録です。自動採点や総合品質点ではありません。", "Assessments are retrospective records attributed to the user or AI, without automatic grading or an overall quality score.")}</p>
    </section>
  );
}

function ComparisonTable({ runs }: { runs: SavedRun[] }) {
  const rows: Array<[string, (run: SavedRun) => string]> = [
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
  ];
  return (
    <div className="comparison-table-scroll" tabIndex={0} aria-label={t("保存記録の比較表", "Saved-record comparison")}>
      <table className="comparison-table">
        <thead><tr><th scope="col">{t("項目", "Metric")}</th>{runs.map((run) => <th scope="col" key={run.runId}><SourcePortrait review={run} /><strong>{run.title ?? t("名称なし", "Untitled")}</strong><span>{associationLabel(run)}</span></th>)}</tr></thead>
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

export function ComparisonWorkbench({
  sourceController,
  taskHandoff,
}: {
  sourceController: SourceController;
  taskHandoff?: Readonly<{ taskId: string }>;
}) {
  const comparison = useComparisonController(sourceController);
  const replay = useReplayController(sourceController);
  const { state } = comparison;
  const [taskId, setTaskId] = useState(taskHandoff?.taskId ?? "");
  const [throughTurnId, setThroughTurnId] = useState("");
  const [favoriteNames, setFavoriteNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (taskHandoff) {
      const requestedTask = taskHandoff.taskId.toLowerCase();
      if (
        taskId.trim().toLowerCase() !== requestedTask ||
        (state.review &&
          state.review.measurement.taskId.toLowerCase() !== requestedTask)
      ) {
        comparison.clearReview();
        setThroughTurnId("");
      }
      setTaskId(taskHandoff.taskId);
    }
    // Each handoff is an explicit action, including repeated UUIDs.
  }, [taskHandoff]);
  useEffect(() => {
    setThroughTurnId(state.review?.measurement.throughTurnId ?? "");
  }, [state.review?.reviewId]);
  const sourceReady = !!state.context && !!sourceController.view?.source;
  return (
    <div className="comparison-workbench">
      <section className="comparison-hero">
        <p className="eyebrow">{t("SAME HANGAR ／ 比較", "SAME HANGAR / COMPARISON")}</p>
        <h1>{t("普段の記録と、保存した条件の再実行を見る。", "Review ordinary work and replays of saved conditions.")}</h1>
        <p>{t("1〜3件の記録を並べます。保存した条件から順番に試すこともできます。性能の優劣と作成資格は自動判定しません。", "Compare 1–3 records or try saved conditions in sequence. No performance ranking or artwork eligibility is assigned automatically.")}</p>
      </section>
      {!sourceReady && <section className="comparison-panel"><h2>{t("通常装備の登録が必要です", "Normal registration required")}</h2><p className="muted">{t("「装備」タブで対象を登録すると、このローカル履歴を利用できます。", "Register targets in the Loadout tab to use this local history.")}</p></section>}
      {sourceReady && <>
        <StartingConditions sourceController={sourceController} onReplay={startId => { void replay.review(startId); document.getElementById("replay-workbench")?.scrollIntoView({ block: "start" }); }} />
        <ReplayWorkbench controller={replay} shared={sourceController} />
        <section className="comparison-panel" aria-labelledby="run-review-heading">
          <div className="comparison-heading"><div><p className="eyebrow">{t("記録を読む", "Read records")}</p><h2 id="run-review-heading">{t("Codexタスクを確認", "Inspect a Codex task")}</h2></div><span>{t("タスクを開始・再開しません", "Does not start or resume a task")}</span></div>
          <div className="review-form">
            <label>{t("タスクUUID", "Task UUID")}<input autoComplete="off" spellCheck={false} disabled={sourceController.busy} value={taskId} aria-invalid={taskId.length > 0 && !validTaskId(taskId)} onChange={(event) => {
              const next = event.target.value;
              if (state.review && state.review.measurement.taskId.toLowerCase() !== next.trim().toLowerCase()) {
                comparison.clearReview();
                setThroughTurnId("");
              }
              setTaskId(next);
            }} /></label>
            {state.review && <label>{t("完了位置", "Completion point")}<select disabled={sourceController.busy} value={throughTurnId} onChange={(event) => setThroughTurnId(event.target.value)}>{state.review.measurement.availableTurns.map((turn) => <option key={turn.turnId} value={turn.turnId}>{turn.ordinal}{t("ターン目 · ", " turn · ")}{turn.completed ? t("完了", "Complete") : t("未完了", "Incomplete")}</option>)}</select></label>}
            <button className="secondary" disabled={sourceController.busy || !validTaskId(taskId)} onClick={() => void comparison.reviewRun(taskId.trim(), reviewCutoffForTask(state.review, taskId, throughTurnId))}>{state.review ? t("選んだ完了位置まで再確認", "Recheck through selected completion") : t("最初のターンを確認", "Check the first turn")}</button>
          </div>
          <p className="muted">{t("初回は最初の記録ターンだけです。後の完了位置を選ぶと、それ以前のターンも同じタスクの支出として含みます。", "Initially checks only the first recorded turn. A later completion point includes preceding turns as usage of the same task.")}</p>
        </section>
        {state.review && <><ReviewSummary review={state.review} /><AssessmentEditor review={state.review} correction={state.correctionRun} disabled={sourceController.busy} onSave={(value) => void comparison.saveRun(value)} /></>}
        <section className="comparison-panel" aria-labelledby="history-heading">
          <div className="comparison-heading"><div><p className="eyebrow">{t("保存履歴", "Saved history")}</p><h2 id="history-heading">{t("比較する記録を選ぶ", "Choose records to compare")}</h2></div><span>{t("最大3件", "Up to 3")}</span></div>
          <button className="secondary" disabled={sourceController.busy} onClick={() => void comparison.loadRuns()}>{t("履歴を読み込む", "Load history")}</button>
          <ul className="run-history">
            {state.runs.map((run) => {
              const selected = state.selectedRunIds.includes(run.runId);
              return <li key={run.runId}>
                <label className="run-select"><input type="checkbox" checked={selected} disabled={sourceController.busy || (!selected && state.selectedRunIds.length >= 3)} onChange={(event) => comparison.selectRuns(event.target.checked ? [...state.selectedRunIds, run.runId] : state.selectedRunIds.filter((id) => id !== run.runId))} /><span><strong>{run.title ?? t("名称なし", "Untitled")}</strong><small>{capturedLabel(run.capturedAt)} ／ {associationLabel(run)} ／ {outcomeLabels[run.assessment.outcome]} ／ {formatNumber(run.measurement.usage.totals.totalTokens)} tokens{run.measurement.usage.availability === "partial" ? t("（一部）", " (partial)") : ""}</small></span></label>
                <div className="run-actions"><button className="text-button" disabled={sourceController.busy} onClick={() => comparison.beginCorrection(run)}>{t("評価を訂正", "Revise assessment")}</button><button className="text-button" disabled={sourceController.busy} onClick={() => void comparison.readOutput(run.runId)}>{t("出力を明示して読む", "Read the output explicitly")}</button>{run.source.association && <><input disabled={sourceController.busy} aria-label={t(`${run.title ?? t("名称なし", "Untitled")}のお気に入り名`, `${run.title ?? t('名称なし', 'Untitled')} favorite name`)} placeholder={t("お気に入り名（任意）", "Favorite name (optional)")} maxLength={120} value={favoriteNames[run.runId] ?? ""} onChange={(event) => setFavoriteNames((old) => ({ ...old, [run.runId]: event.target.value }))} /><button className="text-button" disabled={sourceController.busy} onClick={() => void comparison.saveFavorite(run.runId, favoriteNames[run.runId]?.trim() || undefined)}>{t("この記録の設定を保存", "Save this record's loadout")}</button></>}</div>
                {run.scopeId !== sourceController.view?.source?.registration.scopeId && <small className="muted">{t("Skillの登録範囲を追加する前の記録です。", "This record predates the expanded Skill scope.")}</small>}
              </li>;
            })}
          </ul>
          {state.cursor && <button className="text-button" disabled={sourceController.busy} onClick={() => void comparison.loadRuns(state.cursor!)}>{t("続きを表示", "Load more")}</button>}
          {state.selectedRunIds.length > 0 && <button className="primary comparison-primary" disabled={sourceController.busy} onClick={() => void comparison.compareRuns()}>{t("選んだ", "Selected: ")}{state.selectedRunIds.length}{t("件を比較", " records to compare")}</button>}
        </section>
        {state.comparison && <section className="comparison-panel comparison-results" aria-labelledby="comparison-results-heading">
          <div className="comparison-heading"><div><p className="eyebrow">{t("観測記録 ／ 中立", "OBSERVATIONS / NEUTRAL")}</p><h2 id="comparison-results-heading">{t("横並びの記録", "Side-by-side records")}</h2></div><span className="neutral-badge">{t("判定なし", "No ranking")}</span></div>
          <dl className="aggregate-summary"><div><dt>{t("記録数", "Records")}</dt><dd>{state.comparison.aggregate.recordCount}</dd></div><div><dt>{t("別タスク数", "Distinct tasks")}</dt><dd>{state.comparison.aggregate.distinctTaskCount}</dd></div><div><dt>{t("算入された採用版", "Counted accepted versions")}</dt><dd>{state.comparison.aggregate.acceptedCount}</dd></div><div><dt>{t("合計トークン", "Total tokens")}</dt><dd>{formatNumber(state.comparison.aggregate.totalTokens)}</dd></div><div><dt>{t("採用版1件あたり", "Per accepted version")}</dt><dd>{formatNumber(state.comparison.aggregate.tokensPerAcceptedRun)}</dd></div></dl>
          <ComparisonTable runs={state.comparison.runs} />
          <TokenBars runs={state.comparison.runs} />
          {[...state.comparison.aggregate.reasons, ...state.comparison.reasons].map((reason) => <p className="comparison-reason" key={reason}>{aggregateReasonLabels[reason] ?? reason}</p>)}
          <details><summary>{t("条件・チェック・評価・メモ", "Conditions, checks, assessments and notes")}</summary>{state.comparison.runs.map((run) => { const conditions = conditionEvidence(run.measurement.conditions); return <article className="assessment-details" key={run.runId}><h3>{run.title ?? associationLabel(run)}</h3><p>{t("初期条件：モデル ", "Initial conditions: model ")}{conditions.initialModel} {t(" ／ 推論 ", " / Reasoning ")}{conditions.initialReasoningEffort} {t(" ／ 実行ポリシー ", " / Execution policy ")}{conditions.initialExecutionPolicy}</p><p>{t("途中で変化：", "Changed during work: ")}{conditions.changed} {t(" ／ 不明：", " / Unknown: ")}{conditions.unknown}</p><p>{provenanceLabels[run.assessment.provenance]} ／ {outcomeLabels[run.assessment.outcome]}</p><ul>{run.assessment.requirements.map((item) => <li key={item.id}>{item.label}：{requirementLabels[item.result]}{item.critical ? t("（必須）", " (required)") : ""}</li>)}</ul>{run.assessment.ratings.map((item) => <p key={item.id}><strong>{item.label} {item.score}/5</strong>（{item.lowAnchor}〜{item.highAnchor}）：{item.reason}</p>)}{run.assessment.note && <p className="muted">{t("メモ：", "Notes: ")}{run.assessment.note}</p>}</article>; })}</details>
        </section>}
        {state.output && <section className="comparison-panel explicit-output" aria-labelledby="output-heading"><div className="comparison-heading"><div><h2 id="output-heading">{t("明示して開いた出力", "Explicitly opened output")}</h2><code>{runReferenceLabel(state.output.runId, state.runs)}</code></div><span>{t("プレーンテキスト", "Plain text")}</span></div>{state.output.available && state.output.text !== null ? <pre>{state.output.text}</pre> : <p>{t("出力は利用できません（", "Output unavailable (")}{state.output.reason ?? t("理由不明", "Reason unknown")}）。</p>}</section>}
        {state.notice && <p className="comparison-notice" role="status" aria-live="polite">{state.notice}</p>}
        {state.backgroundError && <p className="comparison-error" role="alert">{state.backgroundError}</p>}
        {state.error && <div className="comparison-error" role="alert">{state.error}{state.uncertainOperation && <p>{t("同じ保存操作を自動では繰り返しません。", "The same save operation is not retried automatically.")}</p>}</div>}
      </>}
    </div>
  );
}
