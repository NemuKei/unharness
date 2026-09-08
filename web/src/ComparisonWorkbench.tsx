import { useEffect, useState } from "react";
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

type SourceController = ReturnType<typeof useSourceController>;

const usageLabels: Record<UsageAvailability, string> = {
  available: "記録あり",
  partial: "一部のみ",
  unavailable: "不明",
};

function capturedLabel(value: string) {
  const time = new Date(value);
  return Number.isFinite(time.valueOf())
    ? time.toLocaleString("ja-JP")
    : "日時不明";
}

function associationLabel(review: RunReview) {
  const association = review.source.association;
  return association
    ? modePresentation[association.preparedMode].title
    : "関連する装備は不明";
}

function SourcePortrait({ review }: { review: RunReview }) {
  const mode = historicalMode(review);
  if (!mode)
    return (
      <div className="comparison-portrait unknown" role="img" aria-label="関連する装備は不明">
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
      aria-label={`${modePresentation[mode].title}の履歴上の装備`}
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
          <p className="eyebrow">通常利用の記録</p>
          <h2 id="review-summary-heading">観測した内容</h2>
        </div>
        <span className="neutral-badge">観測記録</span>
      </div>
      <div className="review-overview">
        <SourcePortrait review={review} />
        <dl>
          <div><dt>履歴上の装備</dt><dd>{associationLabel(review)}</dd></div>
          <div><dt>選択した完了位置</dt><dd>{measurement.selectedTurnIds.length} ターン目まで</dd></div>
          <div><dt>ルート応答のトークン</dt><dd>{formatNumber(measurement.usage.totals.totalTokens)}{measurement.usage.availability === "partial" ? "（一部のみ）" : ""}</dd></div>
          <div><dt>記録された実行時間</dt><dd>{formatDuration(measurement.time.recordedTurnDurationMs)}</dd></div>
          <div><dt>最初の応答まで</dt><dd>{formatDuration(measurement.time.firstResponseMs)}</dd></div>
          <div><dt>使用量の状態</dt><dd>{usageLabels[measurement.usage.availability]}</dd></div>
          <div><dt>評価時期</dt><dd>後から付ける評価</dd></div>
        </dl>
      </div>
      <p className="comparison-boundary">
        使用量は記録されたルート応答だけです。子タスク、全体の完全性、ツール、メモリ入力、開始時の依頼とファイルは不明です。
      </p>
      <details>
        <summary>条件・収集範囲・問題の詳細</summary>
        <dl className="comparison-details">
          <div><dt>最初のモデル</dt><dd>{conditions.initialModel}</dd></div>
          <div><dt>最初の推論設定</dt><dd>{conditions.initialReasoningEffort}</dd></div>
          <div><dt>最初の実行ポリシー</dt><dd>{conditions.initialExecutionPolicy}</dd></div>
          <div><dt>途中で変化した条件</dt><dd>{conditions.changed}</dd></div>
          <div><dt>不明な条件</dt><dd>{conditions.unknown}</dd></div>
          <div><dt>実行環境</dt><dd>不明（収集環境とは別）</dd></div>
          <div><dt>収集環境</dt><dd>{review.collectedOn.platform} / {review.collectedOn.architecture} / Node {review.collectedOn.nodeVersion}</dd></div>
          <div><dt>ソース関連</dt><dd>{review.source.association ? "最初のターンだけ一致" : review.source.issue ?? review.source.observation?.status ?? "不明"}</dd></div>
          <div><dt>入力トークン</dt><dd>{formatNumber(measurement.usage.totals.inputTokens)}</dd></div>
          <div><dt>キャッシュ入力</dt><dd>{formatNumber(measurement.usage.totals.cachedInputTokens)}</dd></div>
          <div><dt>キャッシュ書込入力</dt><dd>{formatNumber(measurement.usage.totals.cacheWriteInputTokens)}</dd></div>
          <div><dt>出力トークン</dt><dd>{formatNumber(measurement.usage.totals.outputTokens)}</dd></div>
          <div><dt>推論出力トークン</dt><dd>{formatNumber(measurement.usage.totals.reasoningOutputTokens)}</dd></div>
          <div><dt>記録したルート応答</dt><dd>{measurement.usage.responseCount}件（重複 {measurement.usage.duplicateCount}件、除外 {measurement.usage.excludedCount}件）</dd></div>
          <div><dt>最終thread累積値</dt><dd>{formatNumber(measurement.usage.finalReportedThreadTotals.totalTokens)}（構成は不明）</dd></div>
        </dl>
        {(measurement.issues.length > 0 || measurement.usage.reasons.length > 0) && (
          <p className="muted">記録上の理由：{[...measurement.issues, ...measurement.usage.reasons].join("、")}</p>
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
          <p className="eyebrow">評価を付ける</p>
          <h2 id="assessment-heading">{correction ? "訂正版を保存" : "記録を保存"}</h2>
        </div>
        <span>元の測定は変更しません</span>
      </div>
      <div className="comparison-form-grid">
        <label>任意のタイトル<input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>結果<select value={assessment.outcome} onChange={(event) => setAssessment((old) => ({ ...old, outcome: event.target.value as RunAssessment["outcome"] }))}>{Object.entries(outcomeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>評価した人<select value={assessment.provenance} onChange={(event) => setAssessment((old) => ({ ...old, provenance: event.target.value as RunAssessment["provenance"] }))}>{Object.entries(provenanceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      </div>
      <div className="assessment-group">
        <div className="comparison-heading"><h3>要件チェック</h3><button className="text-button" type="button" disabled={assessment.requirements.length >= 24} onClick={() => setAssessment((old) => ({ ...old, requirements: [...old.requirements, { id: `requirement-${crypto.randomUUID().slice(0, 8)}`, label: "", critical: false, result: "unknown" }] }))}>要件を追加</button></div>
        {assessment.requirements.map((row, index) => (
          <div className="assessment-row" key={row.id}>
            <input aria-label={`要件 ${index + 1}`} placeholder="確認した要件" maxLength={160} value={row.label} onChange={(event) => setAssessment((old) => ({ ...old, requirements: old.requirements.map((item) => item.id === row.id ? { ...item, label: event.target.value } : item) }))} />
            <label className="inline-check"><input type="checkbox" checked={row.critical} onChange={(event) => setAssessment((old) => ({ ...old, requirements: old.requirements.map((item) => item.id === row.id ? { ...item, critical: event.target.checked } : item) }))} />必須</label>
            <select aria-label={`要件 ${index + 1} の結果`} value={row.result} onChange={(event) => setAssessment((old) => ({ ...old, requirements: old.requirements.map((item) => item.id === row.id ? { ...item, result: event.target.value as typeof row.result } : item) }))}>{Object.entries(requirementLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
            <button type="button" className="text-button" onClick={() => setAssessment((old) => ({ ...old, requirements: old.requirements.filter((item) => item.id !== row.id) }))}>削除</button>
          </div>
        ))}
        {!assessment.requirements.length && <p className="muted">要件が空の採用は、本人の申告だけとして記録されます。</p>}
      </div>
      <div className="assessment-group">
        <div className="comparison-heading"><h3>基準別の評価</h3><button className="text-button" type="button" disabled={assessment.ratings.length >= 8} onClick={() => setAssessment((old) => ({ ...old, ratings: [...old.ratings, { id: `rating-${crypto.randomUUID().slice(0, 8)}`, label: "", score: 3, lowAnchor: "", highAnchor: "", reason: "" }] }))}>評価を追加</button></div>
        {assessment.ratings.map((row, index) => (
          <div className="rating-row" key={row.id}>
            <input aria-label={`評価基準 ${index + 1}`} placeholder="基準名" maxLength={160} value={row.label} onChange={(event) => setAssessment((old) => ({ ...old, ratings: old.ratings.map((item) => item.id === row.id ? { ...item, label: event.target.value } : item) }))} />
            <label>点数<select value={row.score} onChange={(event) => setAssessment((old) => ({ ...old, ratings: old.ratings.map((item) => item.id === row.id ? { ...item, score: Number(event.target.value) } : item) }))}>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}</select></label>
            <input aria-label={`評価基準 ${index + 1} の低い基準`} placeholder="1点の基準" maxLength={160} value={row.lowAnchor} onChange={(event) => setAssessment((old) => ({ ...old, ratings: old.ratings.map((item) => item.id === row.id ? { ...item, lowAnchor: event.target.value } : item) }))} />
            <input aria-label={`評価基準 ${index + 1} の高い基準`} placeholder="5点の基準" maxLength={160} value={row.highAnchor} onChange={(event) => setAssessment((old) => ({ ...old, ratings: old.ratings.map((item) => item.id === row.id ? { ...item, highAnchor: event.target.value } : item) }))} />
            <textarea aria-label={`評価基準 ${index + 1} の理由`} placeholder="この点数の理由" maxLength={500} value={row.reason} onChange={(event) => setAssessment((old) => ({ ...old, ratings: old.ratings.map((item) => item.id === row.id ? { ...item, reason: event.target.value } : item) }))} />
            <button type="button" className="text-button" onClick={() => setAssessment((old) => ({ ...old, ratings: old.ratings.filter((item) => item.id !== row.id) }))}>削除</button>
          </div>
        ))}
      </div>
      <label className="comparison-note">補足<textarea maxLength={2000} value={assessment.note ?? ""} onChange={(event) => setAssessment((old) => ({ ...old, note: event.target.value }))} /></label>
      <button className="primary comparison-primary" disabled={disabled || !canSave} onClick={() => onSave({ ...(title.trim() ? { title: title.trim() } : {}), assessment })}>{correction ? "訂正版を保存" : "この評価で保存"}</button>
      <p className="muted">評価はユーザーまたはAIに帰属する後付けの記録です。自動採点や総合品質点ではありません。</p>
    </section>
  );
}

function ComparisonTable({ runs }: { runs: SavedRun[] }) {
  const rows: Array<[string, (run: SavedRun) => string]> = [
    ["結果", (run) => outcomeLabels[run.assessment.outcome]],
    ["算入された採用", (run) => run.acceptance.accepted ? "はい" : "いいえ"],
    ["ルート応答トークン", (run) => `${formatNumber(run.measurement.usage.totals.totalTokens)}${run.measurement.usage.availability === "partial" ? "（一部）" : ""}`],
    ["入力トークン", (run) => formatNumber(run.measurement.usage.totals.inputTokens)],
    ["キャッシュ入力", (run) => formatNumber(run.measurement.usage.totals.cachedInputTokens)],
    ["キャッシュ書込入力", (run) => formatNumber(run.measurement.usage.totals.cacheWriteInputTokens)],
    ["出力トークン", (run) => formatNumber(run.measurement.usage.totals.outputTokens)],
    ["推論出力トークン", (run) => formatNumber(run.measurement.usage.totals.reasoningOutputTokens)],
    ["記録された実行時間", (run) => formatDuration(run.measurement.time.recordedTurnDurationMs)],
    ["最初の応答まで", (run) => formatDuration(run.measurement.time.firstResponseMs)],
    ["ルート応答数", (run) => formatNumber(run.measurement.usage.responseCount)],
    ["選択ターン", (run) => String(run.measurement.selectedTurnIds.length)],
    ["最初のモデル", (run) => conditionEvidence(run.measurement.conditions).initialModel],
    ["最初の推論設定", (run) => conditionEvidence(run.measurement.conditions).initialReasoningEffort],
    ["最初の実行ポリシー", (run) => conditionEvidence(run.measurement.conditions).initialExecutionPolicy],
    ["途中で変化した条件", (run) => conditionEvidence(run.measurement.conditions).changed],
    ["不明な条件", (run) => conditionEvidence(run.measurement.conditions).unknown],
    ["評価者", (run) => provenanceLabels[run.assessment.provenance]],
    ["ソース範囲", (run) => run.source.association ? "最初のターンだけ" : "関連不明"],
  ];
  return (
    <div className="comparison-table-scroll" tabIndex={0} aria-label="保存記録の比較表">
      <table className="comparison-table">
        <thead><tr><th scope="col">項目</th>{runs.map((run) => <th scope="col" key={run.runId}><SourcePortrait review={run} /><strong>{run.title ?? "名称なし"}</strong><span>{associationLabel(run)}</span></th>)}</tr></thead>
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
      <figcaption id="token-chart-title">記録されたルート応答トークン</figcaption>
      {runs.map((run) => {
        const value = run.measurement.usage.totals.totalTokens;
        const width = tokenBarPercent(value, maximum);
        return <div className={`token-row ${run.measurement.usage.availability}`} key={run.runId}><span className="token-name">{run.title ?? associationLabel(run)}</span><div className="token-track" aria-hidden="true">{width !== null && <span className="token-mark" style={{ width: `${width}%` }} />}</div><strong>{formatNumber(value)}{run.measurement.usage.availability === "partial" ? "（一部）" : ""}</strong></div>;
      })}
      <p className="muted">すべてゼロから同じ最大値までの比率です。短い棒は優劣を表しません。数値と比較表が代替情報です。</p>
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
        <p className="eyebrow">SAME HANGAR ／ 比較</p>
        <h1>通常利用の記録を、同じ格納庫で見る。</h1>
        <p>1〜3件の保存記録を並べます。異なる普段のタスクは条件を揃えた試験ではないため、優劣や作成資格を判定しません。</p>
      </section>
      {!sourceReady && <section className="comparison-panel"><h2>通常装備の登録が必要です</h2><p className="muted">「装備」タブで対象を登録すると、このローカル履歴を利用できます。</p></section>}
      {sourceReady && <>
        <section className="comparison-panel" aria-labelledby="run-review-heading">
          <div className="comparison-heading"><div><p className="eyebrow">記録を読む</p><h2 id="run-review-heading">Codexタスクを確認</h2></div><span>タスクを開始・再開しません</span></div>
          <div className="review-form">
            <label>タスクUUID<input autoComplete="off" spellCheck={false} disabled={sourceController.busy} value={taskId} aria-invalid={taskId.length > 0 && !validTaskId(taskId)} onChange={(event) => {
              const next = event.target.value;
              if (state.review && state.review.measurement.taskId.toLowerCase() !== next.trim().toLowerCase()) {
                comparison.clearReview();
                setThroughTurnId("");
              }
              setTaskId(next);
            }} /></label>
            {state.review && <label>完了位置<select disabled={sourceController.busy} value={throughTurnId} onChange={(event) => setThroughTurnId(event.target.value)}>{state.review.measurement.availableTurns.map((turn) => <option key={turn.turnId} value={turn.turnId}>{turn.ordinal}ターン目 · {turn.completed ? "完了" : "未完了"}</option>)}</select></label>}
            <button className="secondary" disabled={sourceController.busy || !validTaskId(taskId)} onClick={() => void comparison.reviewRun(taskId.trim(), reviewCutoffForTask(state.review, taskId, throughTurnId))}>{state.review ? "選んだ完了位置まで再確認" : "最初のターンを確認"}</button>
          </div>
          <p className="muted">初回は最初の記録ターンだけです。後の完了位置を選ぶと、それ以前のターンも同じタスクの支出として含みます。</p>
        </section>
        {state.review && <><ReviewSummary review={state.review} /><AssessmentEditor review={state.review} correction={state.correctionRun} disabled={sourceController.busy} onSave={(value) => void comparison.saveRun(value)} /></>}
        <section className="comparison-panel" aria-labelledby="history-heading">
          <div className="comparison-heading"><div><p className="eyebrow">保存履歴</p><h2 id="history-heading">比較する記録を選ぶ</h2></div><span>最大3件</span></div>
          <button className="secondary" disabled={sourceController.busy} onClick={() => void comparison.loadRuns()}>履歴を読み込む</button>
          <ul className="run-history">
            {state.runs.map((run) => {
              const selected = state.selectedRunIds.includes(run.runId);
              return <li key={run.runId}>
                <label className="run-select"><input type="checkbox" checked={selected} disabled={sourceController.busy || (!selected && state.selectedRunIds.length >= 3)} onChange={(event) => comparison.selectRuns(event.target.checked ? [...state.selectedRunIds, run.runId] : state.selectedRunIds.filter((id) => id !== run.runId))} /><span><strong>{run.title ?? "名称なし"}</strong><small>{capturedLabel(run.capturedAt)} ／ {associationLabel(run)} ／ {outcomeLabels[run.assessment.outcome]} ／ {formatNumber(run.measurement.usage.totals.totalTokens)} tokens{run.measurement.usage.availability === "partial" ? "（一部）" : ""}</small></span></label>
                <div className="run-actions"><button className="text-button" disabled={sourceController.busy} onClick={() => comparison.beginCorrection(run)}>評価を訂正</button><button className="text-button" disabled={sourceController.busy} onClick={() => void comparison.readOutput(run.runId)}>出力を明示して読む</button>{run.source.association && <><input disabled={sourceController.busy} aria-label={`${run.title ?? "名称なし"}のお気に入り名`} placeholder="お気に入り名（任意）" maxLength={120} value={favoriteNames[run.runId] ?? ""} onChange={(event) => setFavoriteNames((old) => ({ ...old, [run.runId]: event.target.value }))} /><button className="text-button" disabled={sourceController.busy} onClick={() => void comparison.saveFavorite(run.runId, favoriteNames[run.runId]?.trim() || undefined)}>この記録の設定を保存</button></>}</div>
              </li>;
            })}
          </ul>
          {state.cursor && <button className="text-button" disabled={sourceController.busy} onClick={() => void comparison.loadRuns(state.cursor!)}>続きを表示</button>}
          {state.selectedRunIds.length > 0 && <button className="primary comparison-primary" disabled={sourceController.busy} onClick={() => void comparison.compareRuns()}>選んだ{state.selectedRunIds.length}件を比較</button>}
        </section>
        {state.comparison && <section className="comparison-panel comparison-results" aria-labelledby="comparison-results-heading">
          <div className="comparison-heading"><div><p className="eyebrow">観測記録 ／ 中立</p><h2 id="comparison-results-heading">横並びの記録</h2></div><span className="neutral-badge">判定なし</span></div>
          <dl className="aggregate-summary"><div><dt>記録数</dt><dd>{state.comparison.aggregate.recordCount}</dd></div><div><dt>別タスク数</dt><dd>{state.comparison.aggregate.distinctTaskCount}</dd></div><div><dt>算入された採用版</dt><dd>{state.comparison.aggregate.acceptedCount}</dd></div><div><dt>合計トークン</dt><dd>{formatNumber(state.comparison.aggregate.totalTokens)}</dd></div><div><dt>採用版1件あたり</dt><dd>{formatNumber(state.comparison.aggregate.tokensPerAcceptedRun)}</dd></div></dl>
          <ComparisonTable runs={state.comparison.runs} />
          <TokenBars runs={state.comparison.runs} />
          {[...state.comparison.aggregate.reasons, ...state.comparison.reasons].map((reason) => <p className="comparison-reason" key={reason}>{aggregateReasonLabels[reason] ?? reason}</p>)}
          <details><summary>条件・チェック・評価・メモ</summary>{state.comparison.runs.map((run) => { const conditions = conditionEvidence(run.measurement.conditions); return <article className="assessment-details" key={run.runId}><h3>{run.title ?? associationLabel(run)}</h3><p>初期条件：モデル {conditions.initialModel} ／ 推論 {conditions.initialReasoningEffort} ／ 実行ポリシー {conditions.initialExecutionPolicy}</p><p>途中で変化：{conditions.changed} ／ 不明：{conditions.unknown}</p><p>{provenanceLabels[run.assessment.provenance]} ／ {outcomeLabels[run.assessment.outcome]}</p><ul>{run.assessment.requirements.map((item) => <li key={item.id}>{item.label}：{requirementLabels[item.result]}{item.critical ? "（必須）" : ""}</li>)}</ul>{run.assessment.ratings.map((item) => <p key={item.id}><strong>{item.label} {item.score}/5</strong>（{item.lowAnchor}〜{item.highAnchor}）：{item.reason}</p>)}{run.assessment.note && <p className="muted">メモ：{run.assessment.note}</p>}</article>; })}</details>
        </section>}
        {state.output && <section className="comparison-panel explicit-output" aria-labelledby="output-heading"><div className="comparison-heading"><div><h2 id="output-heading">明示して開いた出力</h2><code>{runReferenceLabel(state.output.runId, state.runs)}</code></div><span>プレーンテキスト</span></div>{state.output.available && state.output.text !== null ? <pre>{state.output.text}</pre> : <p>出力は利用できません（{state.output.reason ?? "理由不明"}）。</p>}</section>}
        {state.notice && <p className="comparison-notice" role="status" aria-live="polite">{state.notice}</p>}
        {state.error && <div className="comparison-error" role="alert">{state.error}{state.uncertainOperation && <p>同じ保存操作を自動では繰り返しません。</p>}</div>}
      </>}
    </div>
  );
}
