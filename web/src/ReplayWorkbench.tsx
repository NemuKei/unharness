import { text as t } from './locale.ts';
import { useState } from "react";
import { PluginObservationSummary } from './PluginObservationSummary';
import type { useSourceController } from "./useSourceController";
import type { useReplayController } from "./useReplayController";
import { phaseLabels, qualificationLabels, replayIssue } from "./replays";
import type { ReplayResult, ReplayResultReview, ReplayAssessment } from "./replays";
import { modePresentation, validTaskId } from "./sources";
import { formatNumber, formatDuration, outcomeLabels, requirementLabels, provenanceLabels } from "./comparisons";
const date = (x: string | null) => x ? new Date(x).toLocaleString(t("ja-JP", "en-US")) : t("未確認", "Unconfirmed");
const bytes = (x: number | null) => x === null ? t("不明", "Unknown") : x < 1024 ? `${x} B` : `${(x / 1024).toFixed(1)} KiB`;
function assessmentFor(r: ReplayResultReview | ReplayResult): ReplayAssessment {
  const previous = "resultId" in r ? r.assessment : null;
  return { outcome: previous?.outcome ?? "unknown", provenance: previous?.provenance ?? "user", note: previous?.note ?? "",
    requirements: r.criteria.requirements.map(c => ({ id: c.id, result: previous?.requirements.find(x => x.id === c.id)?.result ?? "unknown" })),
    ratings: r.criteria.ratings.map(c => ({ id: c.id, score: previous?.ratings.find(x => x.id === c.id)?.score ?? null,
      reason: previous?.ratings.find(x => x.id === c.id)?.reason ?? "" })) };
}
function ResultEditor({ review, busy, save }: { review: ReplayResultReview | ReplayResult; busy: boolean; save: (a: ReplayAssessment) => Promise<void> }) {
  const [assessment, setAssessment] = useState(() => assessmentFor(review));
  return <fieldset className="replay-assessment" disabled={busy}><legend>{"resultId" in review ? t("評価の訂正版", "Assessment revision") : t("保存前の評価", "Assessment before saving")}</legend>
    <div className="replay-fields"><label>{t("再実行の結果", "Replay result")}<select aria-label={t("再実行の結果", "Replay result")} value={assessment.outcome} onChange={e => setAssessment(a => ({ ...a, outcome: e.target.value as ReplayAssessment["outcome"] }))}>{Object.entries(outcomeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>{t("評価した人", "Assessed by")}<select aria-label={t("再実行の評価者", "Replay assessor")} value={assessment.provenance} onChange={e => setAssessment(a => ({ ...a, provenance: e.target.value as ReplayAssessment["provenance"] }))}>{Object.entries(provenanceLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
    {review.criteria.requirements.map(c => <label key={c.id}>{c.label}{c.critical ? t("（必須）", " (required)") : ""}<select aria-label={t(`${c.label} の結果`, `${c.label} result`)} value={assessment.requirements.find(r => r.id === c.id)!.result}
      onChange={e => setAssessment(a => ({ ...a, requirements: a.requirements.map(r => r.id === c.id ? { ...r, result: e.target.value as typeof r.result } : r) }))}>{Object.entries(requirementLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>)}
    {review.criteria.ratings.map(c => <div key={c.id} className="replay-rating"><label>{c.label}<select aria-label={t(`${c.label} の点数`, `${c.label} score`)} value={assessment.ratings.find(r => r.id === c.id)!.score ?? "unknown"}
      onChange={e => setAssessment(a => ({ ...a, ratings: a.ratings.map(r => r.id === c.id ? { ...r, score: e.target.value === "unknown" ? null : Number(e.target.value) } : r) }))}>
      <option value="unknown">{t("評価できない", "Unable to assess")}</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <small>{c.lowAnchor} 〜 {c.highAnchor}</small><label>{t("評価の理由", "Assessment reason")}<input maxLength={500} value={assessment.ratings.find(r => r.id === c.id)!.reason}
        onChange={e => setAssessment(a => ({ ...a, ratings: a.ratings.map(r => r.id === c.id ? { ...r, reason: e.target.value } : r) }))} /></label></div>)}
    <label>{t("メモ（任意）", "Notes (optional)")}<textarea rows={2} maxLength={2000} value={assessment.note} onChange={e => setAssessment(a => ({ ...a, note: e.target.value }))} /></label>
    <p className="muted">{t("評価項目・必須条件・点数の基準は、実行前に保存した内容を使います。", "Criteria, requirements and score descriptions use the version saved before execution.")}</p>
    <button className="primary" disabled={assessment.ratings.some(r => !r.reason.trim())} onClick={() => void save(assessment)}>{"resultId" in review ? t("再実行の評価を訂正して保存", "Save revised replay assessment") : t("この再実行の結果を保存", "Save this replay result")}</button>
  </fieldset>;
}
function ResultView({ result }: { result: ReplayResultReview | ReplayResult }) {
  const m = result.measurement;
  return <section className="replay-result" aria-label={t("取り込んだ再実行の記録", "Imported replay record")}><h3>{t("結果の確認", "Review result")}</h3>
    <p className="muted">{date(result.capturedAt)} {t(" に取り込んだ記録です。", " was the import time.")}</p>
    <span className="neutral-badge">{qualificationLabels[result.qualification.status]}</span>
    <PluginObservationSummary evidence={result.qualification} />
    <dl className="replay-summary"><div><dt>{t("試行時の装備", "Loadout used for this attempt")}</dt><dd>{modePresentation[result.preparedMode].title}</dd></div>
      <div><dt>{t("モデル", "Model")}</dt><dd>{m?.conditions.model ?? t("不明", "Unknown")}</dd></div><div><dt>{t("推論設定", "Reasoning setting")}</dt><dd>{m?.conditions.reasoningEffort ?? t("不明", "Unknown")}</dd></div>
      <div><dt>{t("記録したターン", "Recorded turns")}</dt><dd>{formatNumber(result.budget.recordedTurns)}</dd></div><div><dt>{t("ルート応答のトークン", "Root-response tokens")}</dt><dd>{formatNumber(m?.usage.totals.totalTokens ?? null)}</dd></div>
      <div><dt>{t("記録された実行時間", "Recorded elapsed time")}</dt><dd>{formatDuration(m?.time.recordedTurnDurationMs ?? null)}</dd></div>
      <div><dt>{t("打ち切り上限", "Attempt limits")}</dt><dd>{result.budget.status === "within-recorded-budget" ? t("記録された範囲では上限内", "Within limits in the recorded scope") : result.budget.status === "exceeded" ? t("上限を超過", "Limit exceeded") : t("上限内か不明", "Limit status unknown")}</dd></div>
      <div><dt>{t("成果物の保存", "Saved outputs")}</dt><dd>{result.files.issue ? t("取得できませんでした", "Unavailable") : t(`${result.files.fileCount}ファイル · ${bytes(result.files.totalBytes)}`, `${result.files.fileCount} files · ${bytes(result.files.totalBytes)}`)}</dd></div></dl>
    {"resultId" in result && <p>{result.acceptance.accepted ? t("必要な結果と記録上の条件を満たした版です。", "This version met the required outcomes and recorded conditions.") : t("採用版には算入していません。", "Not counted as an accepted version.")} {t(" 評価：", " Assessment: ")}{provenanceLabels[result.assessment.provenance]} ／ {outcomeLabels[result.assessment.outcome]}</p>}
    {[result.readIssue, result.sourceIssue].filter(Boolean).map(x => <p className="comparison-reason" key={x}>{replayIssue(x!)}</p>)}
    <details><summary>{t("確認できた範囲と問題の詳細", "Verified scope and issues")}</summary><p>{t("開始前のファイル検証と、タスクの記録を照合しています。検証から送信までのファイル変更、メモリ入力、外部ツール、子タスクの完全な使用量は確認できません。", "Compares file verification before starting with the task record. Changes between verification and submission, memory input, external tools and complete child-task usage remain unverified.")}</p>
      <p>{t("タスク：", "Task: ")}<code>{result.taskId}</code></p>
      <p>{result.files.ignoredFiles === "excluded" ? t("成果物の保存では、Git履歴と無視されたファイルを除きます。", "Saved outputs exclude Git history and ignored files.") : t("Git履歴は成果物として保存しません。", "Git history is not saved as output.")}</p>
      {result.qualification.reasons.map(r => <p className="muted" key={r}>{replayIssue(r)}</p>)}
      <p className="muted">{t("採用の記録と性能の優劣は別です。作品はこの評価に関係なく作成できます。", "Acceptance is recorded separately from performance. Artwork creation is an independent choice.")}</p></details>
    <details className="replay-answer"><summary>{t("取り込んだ回答を表示", "Show imported response")}</summary>{result.outputText === null ? <p>{t("回答の記録はありません。", "No recorded response.")}</p> : <pre>{result.outputText}</pre>}</details>
  </section>;
}
export function ReplayWorkbench({ controller: c, shared }: { controller: ReturnType<typeof useReplayController>; shared: ReturnType<typeof useSourceController> }) {
  const { state } = c, a = state.attempt, detail = state.resultReview ?? state.result;
  const [task, setTask] = useState({ attemptId: "", value: "" });
  const taskId = task.attemptId === a?.attemptId ? task.value : "";
  const disabled = shared.busy || !shared.confirmed;
  return <section id="replay-workbench" className="comparison-panel replay-workbench" aria-labelledby="replay-heading" tabIndex={-1}>
    <div className="comparison-heading"><div><p className="eyebrow">{t("保存した条件から", "FROM SAVED CONDITIONS")}</p><h2 id="replay-heading">{t("順番に再実行する", "Replay in sequence")}</h2></div><button className="text-button" disabled={disabled} onClick={() => void c.load()}>{t("再実行の履歴を読む", "Load replay history")}</button></div>
    <p className="muted">{t("開始条件の詳細から「この条件で再実行」を選びます。装備の変更は「装備」タブで適用してから進めてください。", "Choose Replay these conditions from starting-condition details. Apply loadout changes in the Loadout tab first.")}</p>
    {state.review && <article className="replay-review"><h3>{t("再実行の準備内容", "Replay preparation")}</h3><p>{modePresentation[state.review.preparedMode].title} ／ {state.review.fileCount}{t("ファイル · ", " files · ")}{bytes(state.review.totalBytes)}</p>
      <p>{t("各モード ", "Each mode: ")}{state.review.budget.maxAttempts}{t("回まで、1試行 ", " attempts maximum, ")}{state.review.budget.maxTurnsPerAttempt}{t("ターンまで。トークン上限：", " turns per attempt. Token limit: ")}{state.review.budget.maxRecordedTokens === null ? t("指定なし", "None") : formatNumber(state.review.budget.maxRecordedTokens)}</p>
      <p className="muted">{t("元の作業内容から新しい場所を作ります。前の試行の成果物は引き継ぎません。", "Create a new location from the original work. Previous attempt outputs are not carried over.")}</p>
      {state.review.changes.length > 0 && <details><summary>{t("選んだ装備によるファイルの違い（", "File differences for the selected loadout (")}{state.review.changes.length}{t("件）", ")")}</summary><ul>{state.review.changes.map(x => <li key={x.path}>{x.path}：{x.reason === "disabled-skill-entrypoint" ? t("このコピーでは選択済みSkillの入口を除外", "Selected Skill entry points excluded from this copy") : t("選択済みSkillの呼び出し設定", "Selected Skill invocation settings")}</li>)}</ul></details>}
      <button className="primary" disabled={disabled || !!state.activeAttemptId || !!state.uncertain} onClick={() => void c.prepare()}>{t("この内容で再実行を準備", "Prepare this replay")}</button></article>}
    {a && <article className="replay-attempt" key={a.attemptId}><div className="comparison-heading"><h3>{modePresentation[a.preparedMode].title}{t("の試行", " attempt")}</h3><span className="neutral-badge">{phaseLabels[a.phase]}</span></div>
      {a.conditionIssue && <p className="comparison-reason">{replayIssue(a.conditionIssue)}</p>}{a.failure && <p className="comparison-reason">{replayIssue(a.failure)}</p>}
      {a.locationIssue && <p className="muted">{t("作業場所の状態を確認できません。ファイルと記録は保持しています。", "The work location could not be verified. Files and records are preserved.")}</p>}
      <div className="replay-actions">{["prepared", "ready"].includes(a.phase) && <button className="secondary" disabled={disabled || !a.handoffAvailable} onClick={() => void c.handoff()}>{t("開始状態を確認して依頼を受け取る", "Verify the start and get the request")}</button>}
        {!["recorded", "cancelled"].includes(a.phase) && <button className="text-button" disabled={disabled} onClick={() => void c.cancel()}>{t("この試行を取り消す", "Cancel this attempt")}</button>}</div>
      {state.handoff?.attemptId === a.attemptId && <section className="replay-handoff"><h4>{t("新しいタスクへの引き渡し", "Handoff to a new task")}</h4><pre>{state.handoff.request}</pre>
        <div className="replay-actions"><button className="primary" disabled={disabled} onClick={() => void c.handoff(false, true)}>{t("再実行の依頼をコピー", "Copy replay request")}</button>
          <button className="secondary" disabled={disabled} onClick={() => void c.handoff(true)}>{t("Codexで作業場所を開く", "Open the work location in Codex")}</button></div>
        <p className="muted">{t("新規タスクに貼り付けて実行してください。アプリを開くだけでは、タスクは送信されません。", "Paste into a new task and send it. Opening the app does not submit a task.")}</p></section>}
      {a.project && <details><summary>{t("作業場所と開始前の確認時刻", "Work location and preflight time")}</summary><pre>{a.project}</pre><p>{t("最初の開始前確認：", "First preflight: ")}{date(a.readyAt)}</p><p className="muted">{t("Codexが使う設定と保存先は、新しいタスクの記録で確認します。", "Verify the settings and storage Codex uses from the new task's record.")}</p></details>}
      {a.readyAt && a.phase !== "recorded" && <div className="replay-task"><label>{t("再実行したタスクのUUID", "Replayed task UUID")}<input value={taskId} maxLength={36} autoComplete="off" spellCheck={false}
        aria-invalid={taskId.length > 0 && !validTaskId(taskId)} onChange={e => { setTask({ attemptId: a.attemptId, value: e.target.value }); c.invalidateResult(); }} /></label>
        <button className="secondary" disabled={disabled || !validTaskId(taskId)} onClick={() => void c.observe(taskId.trim().toLowerCase())}>{t("このタスクの結果を確認", "Check this task's result")}</button></div>}
    </article>}
    {detail && <><ResultView result={detail} />{state.resultReview
      ? <ResultEditor key={state.resultReview.resultReviewId} review={state.resultReview} busy={disabled} save={c.save} />
      : state.result && <details className="replay-correction"><summary>{t("評価を訂正する", "Revise assessment")}</summary><ResultEditor key={state.result.resultId} review={state.result} busy={disabled} save={c.save} /></details>}
      {state.result && state.result.qualification.status === "matched-record" && !state.result.sourceIssue && !state.result.readIssue
        && <button className="text-button" disabled={disabled} onClick={() => void c.favorite()}>{t("この試行の設定をお気に入りへ", "Save this attempt's loadout as a favorite")}</button>}</>}
    {state.lastSaved && <p className="starting-saved">{t("保存済み：", "Saved: ")}{modePresentation[state.lastSaved.preparedMode].title}{t("の再実行 ／ ", " replay / ")}{date(state.lastSaved.capturedAt)}</p>}
    {state.notice && <p role="status" className="comparison-notice">{state.notice}</p>}
    {state.backgroundError && <p role="alert" className="comparison-error">{state.backgroundError}</p>}
    {state.error && <div role="alert" className="comparison-error">{state.error}{state.uncertain && <p>{t("同じ操作を自動では繰り返しません。", "The same operation is not retried automatically.")}</p>}</div>}
    {state.attempts.length > 0 && <section className="replay-history"><h3>{t("再実行の履歴", "Replay history")}</h3><ul>{state.attempts.map(item => <li key={item.attemptId}>
      <div>{item.resultId && <label className="inline-check"><input type="checkbox" aria-label={t(`${modePresentation[item.preparedMode].title}の再実行を比較に追加`, `Add ${modePresentation[item.preparedMode].title} replay to comparison`)} checked={state.selected.includes(item.resultId)}
        disabled={disabled || state.selected.length >= 3 && !state.selected.includes(item.resultId)} onChange={e => c.select(item.resultId!, e.target.checked)} />{t("比較", "Compare")}</label>}
        <strong>{modePresentation[item.preparedMode].title}</strong><small>{phaseLabels[item.phase]} ／ {date(item.createdAt)}</small>
        {item.scopeId !== shared.view?.source?.registration.scopeId && <small>{t("Skillの登録範囲を追加する前の記録です。", "This record predates the expanded Skill scope.")}</small>}</div>
      <button className="text-button" disabled={disabled} onClick={() => item.resultId ? void c.readResult(item.resultId) : void c.inspect(item.attemptId)}>{item.resultId ? t("再実行の結果を開く", "Open replay result") : t("試行の状態を開く", "Open attempt state")}</button></li>)}</ul>
      {state.cursor && <button className="text-button" disabled={disabled} onClick={() => void c.load(state.cursor!)}>{t("再実行の続きを表示", "Load more replays")}</button>}
      {state.selected.length > 0 && <button className="primary" disabled={disabled} onClick={() => void c.compare()}>{t("選んだ", "Selected: ")}{state.selected.length}{t("件の再実行を比較", " replays to compare")}</button>}</section>}
    {state.comparison && <section className="replay-comparison"><h3>{t("再実行の記録を並べる", "Compare replay records")}</h3><span className="neutral-badge">{t("中立・性能判定なし", "Neutral · no performance ranking")}</span>
      <p className="replay-table-hint muted">{t("表は横にスクロールできます。", "Scroll the table horizontally.")}</p>
      <div className="replay-table" role="region" aria-label={t("再実行の比較表", "Replay comparison")} tabIndex={0}><table><thead><tr><th>{t("記録", "Record")}</th>{state.comparison.results.map(r => <th key={r.resultId}>{modePresentation[r.preparedMode].title}</th>)}</tr></thead><tbody>
        <tr><th>{t("記録条件", "Recorded conditions")}</th>{state.comparison.results.map(r => <td key={r.resultId}>{qualificationLabels[r.qualification.status]}</td>)}</tr>
        <tr><th>{t("モデル", "Model")}</th>{state.comparison.results.map(r => <td key={r.resultId}>{r.measurement?.conditions.model ?? t("不明", "Unknown")}</td>)}</tr>
        <tr><th>{t("ルート応答のトークン", "Root-response tokens")}</th>{state.comparison.results.map(r => <td key={r.resultId}>{formatNumber(r.measurement?.usage.totals.totalTokens ?? null)}</td>)}</tr>
        <tr><th>{t("記録された時間", "Recorded time")}</th>{state.comparison.results.map(r => <td key={r.resultId}>{formatDuration(r.measurement?.time.recordedTurnDurationMs ?? null)}</td>)}</tr>
        <tr><th>{t("結果", "Result")}</th>{state.comparison.results.map(r => <td key={r.resultId}>{outcomeLabels[r.assessment.outcome]} ／ {provenanceLabels[r.assessment.provenance]}</td>)}</tr>
        <tr><th>{t("採用版に算入", "Counted as accepted")}</th>{state.comparison.results.map(r => <td key={r.resultId}>{r.acceptance.accepted ? t("はい", "Yes") : t("いいえ", "No")}</td>)}</tr>
      </tbody></table></div><p>{t("採用版 ", "Accepted versions: ")}{state.comparison.aggregate.acceptedCount}{t("件 ／ 採用版1件あたり ", " / Per accepted version: ")}{formatNumber(state.comparison.aggregate.tokensPerAcceptedRun)} {t(" トークン", " tokens")}</p>
      {state.comparison.aggregate.reasons.map(r => <p key={r} className="muted">{t("集計できない理由：", "Reasons aggregation is unavailable: ")}{r}</p>)}
      <p className="comparison-boundary">{t("記録された範囲の比較です。完全な使用量、同じメモリ入力、送信時の全ファイルを証明するものではありません。", "Comparison covers recorded scope. It does not prove complete usage, identical memory input or all files at submission.")}</p></section>}
  </section>;
}
