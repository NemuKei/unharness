import { useState } from "react";
import type { useSourceController } from "./useSourceController";
import type { useReplayController } from "./useReplayController";
import { phaseLabels, qualificationLabels, replayIssue } from "./replays";
import type { ReplayResult, ReplayResultReview, ReplayAssessment } from "./replays";
import { modePresentation, validTaskId } from "./sources";
import { formatNumber, formatDuration, outcomeLabels, requirementLabels, provenanceLabels } from "./comparisons";
const date = (x: string | null) => x ? new Date(x).toLocaleString("ja-JP") : "未確認";
const bytes = (x: number | null) => x === null ? "不明" : x < 1024 ? `${x} B` : `${(x / 1024).toFixed(1)} KiB`;
function assessmentFor(r: ReplayResultReview | ReplayResult): ReplayAssessment {
  const previous = "resultId" in r ? r.assessment : null;
  return { outcome: previous?.outcome ?? "unknown", provenance: previous?.provenance ?? "user", note: previous?.note ?? "",
    requirements: r.criteria.requirements.map(c => ({ id: c.id, result: previous?.requirements.find(x => x.id === c.id)?.result ?? "unknown" })),
    ratings: r.criteria.ratings.map(c => ({ id: c.id, score: previous?.ratings.find(x => x.id === c.id)?.score ?? null,
      reason: previous?.ratings.find(x => x.id === c.id)?.reason ?? "" })) };
}
function ResultEditor({ review, busy, save }: { review: ReplayResultReview | ReplayResult; busy: boolean; save: (a: ReplayAssessment) => Promise<void> }) {
  const [assessment, setAssessment] = useState(() => assessmentFor(review));
  return <fieldset className="replay-assessment" disabled={busy}><legend>{"resultId" in review ? "評価の訂正版" : "保存前の評価"}</legend>
    <div className="replay-fields"><label>再実行の結果<select aria-label="再実行の結果" value={assessment.outcome} onChange={e => setAssessment(a => ({ ...a, outcome: e.target.value as ReplayAssessment["outcome"] }))}>{Object.entries(outcomeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>評価した人<select aria-label="再実行の評価者" value={assessment.provenance} onChange={e => setAssessment(a => ({ ...a, provenance: e.target.value as ReplayAssessment["provenance"] }))}>{Object.entries(provenanceLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
    {review.criteria.requirements.map(c => <label key={c.id}>{c.label}{c.critical ? "（必須）" : ""}<select aria-label={`${c.label} の結果`} value={assessment.requirements.find(r => r.id === c.id)!.result}
      onChange={e => setAssessment(a => ({ ...a, requirements: a.requirements.map(r => r.id === c.id ? { ...r, result: e.target.value as typeof r.result } : r) }))}>{Object.entries(requirementLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>)}
    {review.criteria.ratings.map(c => <div key={c.id} className="replay-rating"><label>{c.label}<select aria-label={`${c.label} の点数`} value={assessment.ratings.find(r => r.id === c.id)!.score ?? "unknown"}
      onChange={e => setAssessment(a => ({ ...a, ratings: a.ratings.map(r => r.id === c.id ? { ...r, score: e.target.value === "unknown" ? null : Number(e.target.value) } : r) }))}>
      <option value="unknown">評価できない</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <small>{c.lowAnchor} 〜 {c.highAnchor}</small><label>評価の理由<input maxLength={500} value={assessment.ratings.find(r => r.id === c.id)!.reason}
        onChange={e => setAssessment(a => ({ ...a, ratings: a.ratings.map(r => r.id === c.id ? { ...r, reason: e.target.value } : r) }))} /></label></div>)}
    <label>メモ（任意）<textarea rows={2} maxLength={2000} value={assessment.note} onChange={e => setAssessment(a => ({ ...a, note: e.target.value }))} /></label>
    <p className="muted">評価項目・必須条件・点数の基準は、実行前に保存した内容を使います。</p>
    <button className="primary" disabled={assessment.ratings.some(r => !r.reason.trim())} onClick={() => void save(assessment)}>{"resultId" in review ? "再実行の評価を訂正して保存" : "この再実行の結果を保存"}</button>
  </fieldset>;
}
function ResultView({ result }: { result: ReplayResultReview | ReplayResult }) {
  const m = result.measurement;
  return <section className="replay-result" aria-label="取り込んだ再実行の記録"><h3>結果の確認</h3>
    <p className="muted">{date(result.capturedAt)} に取り込んだ記録です。</p>
    <span className="neutral-badge">{qualificationLabels[result.qualification.status]}</span>
    <dl className="replay-summary"><div><dt>試行時の装備</dt><dd>{modePresentation[result.preparedMode].title}</dd></div>
      <div><dt>モデル</dt><dd>{m?.conditions.model ?? "不明"}</dd></div><div><dt>推論設定</dt><dd>{m?.conditions.reasoningEffort ?? "不明"}</dd></div>
      <div><dt>記録したターン</dt><dd>{formatNumber(result.budget.recordedTurns)}</dd></div><div><dt>ルート応答のトークン</dt><dd>{formatNumber(m?.usage.totals.totalTokens ?? null)}</dd></div>
      <div><dt>記録された実行時間</dt><dd>{formatDuration(m?.time.recordedTurnDurationMs ?? null)}</dd></div>
      <div><dt>打ち切り上限</dt><dd>{result.budget.status === "within-recorded-budget" ? "記録された範囲では上限内" : result.budget.status === "exceeded" ? "上限を超過" : "上限内か不明"}</dd></div>
      <div><dt>成果物の保存</dt><dd>{result.files.issue ? "取得できませんでした" : `${result.files.fileCount}ファイル · ${bytes(result.files.totalBytes)}`}</dd></div></dl>
    {"resultId" in result && <p>{result.acceptance.accepted ? "必要な結果と記録上の条件を満たした版です。" : "採用版には算入していません。"} 評価：{provenanceLabels[result.assessment.provenance]} ／ {outcomeLabels[result.assessment.outcome]}</p>}
    {[result.readIssue, result.sourceIssue].filter(Boolean).map(x => <p className="comparison-reason" key={x}>{replayIssue(x!)}</p>)}
    <details><summary>確認できた範囲と問題の詳細</summary><p>開始前のファイル検証と、タスクの記録を照合しています。検証から送信までのファイル変更、メモリ入力、外部ツール、子タスクの完全な使用量は確認できません。</p>
      <p>タスク：<code>{result.taskId}</code></p>
      <p>{result.files.ignoredFiles === "excluded" ? "成果物の保存では、Git履歴と無視されたファイルを除きます。" : "Git履歴は成果物として保存しません。"}</p>
      {result.qualification.reasons.map(r => <p className="muted" key={r}>{replayIssue(r)}</p>)}
      <p className="muted">採用の記録と性能の優劣は別です。この記録だけでは独自形態の作成は解放されません。</p></details>
    <details className="replay-answer"><summary>取り込んだ回答を表示</summary>{result.outputText === null ? <p>回答の記録はありません。</p> : <pre>{result.outputText}</pre>}</details>
  </section>;
}
export function ReplayWorkbench({ controller: c, shared }: { controller: ReturnType<typeof useReplayController>; shared: ReturnType<typeof useSourceController> }) {
  const { state } = c, a = state.attempt, detail = state.resultReview ?? state.result;
  const [task, setTask] = useState({ attemptId: "", value: "" });
  const taskId = task.attemptId === a?.attemptId ? task.value : "";
  const disabled = shared.busy || !shared.confirmed;
  return <section id="replay-workbench" className="comparison-panel replay-workbench" aria-labelledby="replay-heading" tabIndex={-1}>
    <div className="comparison-heading"><div><p className="eyebrow">保存した条件から</p><h2 id="replay-heading">順番に再実行する</h2></div><button className="text-button" disabled={disabled} onClick={() => void c.load()}>再実行の履歴を読む</button></div>
    <p className="muted">開始条件の詳細から「この条件で再実行」を選びます。装備の変更は「装備」タブで適用してから進めてください。</p>
    {state.review && <article className="replay-review"><h3>再実行の準備内容</h3><p>{modePresentation[state.review.preparedMode].title} ／ {state.review.fileCount}ファイル · {bytes(state.review.totalBytes)}</p>
      <p>各モード {state.review.budget.maxAttempts}回まで、1試行 {state.review.budget.maxTurnsPerAttempt}ターンまで。トークン上限：{state.review.budget.maxRecordedTokens === null ? "指定なし" : formatNumber(state.review.budget.maxRecordedTokens)}</p>
      <p className="muted">元の作業内容から新しい場所を作ります。前の試行の成果物は引き継ぎません。</p>
      {state.review.changes.length > 0 && <details><summary>選んだ装備によるファイルの違い（{state.review.changes.length}件）</summary><ul>{state.review.changes.map(x => <li key={x.path}>{x.path}：{x.reason === "disabled-skill-entrypoint" ? "このコピーでは選択済みSkillの入口を除外" : "選択済みSkillの呼び出し設定"}</li>)}</ul></details>}
      <button className="primary" disabled={disabled || !!state.activeAttemptId || !!state.uncertain} onClick={() => void c.prepare()}>この内容で再実行を準備</button></article>}
    {a && <article className="replay-attempt" key={a.attemptId}><div className="comparison-heading"><h3>{modePresentation[a.preparedMode].title}の試行</h3><span className="neutral-badge">{phaseLabels[a.phase]}</span></div>
      {a.conditionIssue && <p className="comparison-reason">{replayIssue(a.conditionIssue)}</p>}{a.failure && <p className="comparison-reason">{replayIssue(a.failure)}</p>}
      {a.locationIssue && <p className="muted">作業場所の状態を確認できません。ファイルと記録は保持しています。</p>}
      <div className="replay-actions">{["prepared", "ready"].includes(a.phase) && <button className="secondary" disabled={disabled || !a.handoffAvailable} onClick={() => void c.handoff()}>開始状態を確認して依頼を受け取る</button>}
        {!["recorded", "cancelled"].includes(a.phase) && <button className="text-button" disabled={disabled} onClick={() => void c.cancel()}>この試行を取り消す</button>}</div>
      {state.handoff?.attemptId === a.attemptId && <section className="replay-handoff"><h4>新しいタスクへの引き渡し</h4><pre>{state.handoff.request}</pre>
        <div className="replay-actions"><button className="primary" disabled={disabled} onClick={() => void c.handoff(false, true)}>再実行の依頼をコピー</button>
          <button className="secondary" disabled={disabled} onClick={() => void c.handoff(true)}>Codexで作業場所を開く</button></div>
        <p className="muted">新規タスクに貼り付けて実行してください。アプリを開くだけでは、タスクは送信されません。</p></section>}
      {a.project && <details><summary>作業場所と開始前の確認時刻</summary><pre>{a.project}</pre><p>最初の開始前確認：{date(a.readyAt)}</p><p className="muted">Codexが使う設定と保存先は、新しいタスクの記録で確認します。</p></details>}
      {a.readyAt && a.phase !== "recorded" && <div className="replay-task"><label>再実行したタスクのUUID<input value={taskId} maxLength={36} autoComplete="off" spellCheck={false}
        aria-invalid={taskId.length > 0 && !validTaskId(taskId)} onChange={e => { setTask({ attemptId: a.attemptId, value: e.target.value }); c.invalidateResult(); }} /></label>
        <button className="secondary" disabled={disabled || !validTaskId(taskId)} onClick={() => void c.observe(taskId.trim().toLowerCase())}>このタスクの結果を確認</button></div>}
    </article>}
    {detail && <><ResultView result={detail} />{state.resultReview
      ? <ResultEditor key={state.resultReview.resultReviewId} review={state.resultReview} busy={disabled} save={c.save} />
      : state.result && <details className="replay-correction"><summary>評価を訂正する</summary><ResultEditor key={state.result.resultId} review={state.result} busy={disabled} save={c.save} /></details>}
      {state.result && state.result.qualification.status === "matched-record" && !state.result.sourceIssue && !state.result.readIssue
        && <button className="text-button" disabled={disabled} onClick={() => void c.favorite()}>この試行の設定をお気に入りへ</button>}</>}
    {state.lastSaved && <p className="starting-saved">保存済み：{modePresentation[state.lastSaved.preparedMode].title}の再実行 ／ {date(state.lastSaved.capturedAt)}</p>}
    {state.notice && <p role="status" className="comparison-notice">{state.notice}</p>}
    {state.backgroundError && <p role="alert" className="comparison-error">{state.backgroundError}</p>}
    {state.error && <div role="alert" className="comparison-error">{state.error}{state.uncertain && <p>同じ操作を自動では繰り返しません。</p>}</div>}
    {state.attempts.length > 0 && <section className="replay-history"><h3>再実行の履歴</h3><ul>{state.attempts.map(item => <li key={item.attemptId}>
      <div>{item.resultId && <label className="inline-check"><input type="checkbox" aria-label={`${modePresentation[item.preparedMode].title}の再実行を比較に追加`} checked={state.selected.includes(item.resultId)}
        disabled={disabled || state.selected.length >= 3 && !state.selected.includes(item.resultId)} onChange={e => c.select(item.resultId!, e.target.checked)} />比較</label>}
        <strong>{modePresentation[item.preparedMode].title}</strong><small>{phaseLabels[item.phase]} ／ {date(item.createdAt)}</small>
        {item.scopeId !== shared.view?.source?.registration.scopeId && <small>Skillの登録範囲を追加する前の記録です。</small>}</div>
      <button className="text-button" disabled={disabled} onClick={() => item.resultId ? void c.readResult(item.resultId) : void c.inspect(item.attemptId)}>{item.resultId ? "再実行の結果を開く" : "試行の状態を開く"}</button></li>)}</ul>
      {state.cursor && <button className="text-button" disabled={disabled} onClick={() => void c.load(state.cursor!)}>再実行の続きを表示</button>}
      {state.selected.length > 0 && <button className="primary" disabled={disabled} onClick={() => void c.compare()}>選んだ{state.selected.length}件の再実行を比較</button>}</section>}
    {state.comparison && <section className="replay-comparison"><h3>再実行の記録を並べる</h3><span className="neutral-badge">中立・性能判定なし</span>
      <p className="replay-table-hint muted">表は横にスクロールできます。</p>
      <div className="replay-table" role="region" aria-label="再実行の比較表" tabIndex={0}><table><thead><tr><th>記録</th>{state.comparison.results.map(r => <th key={r.resultId}>{modePresentation[r.preparedMode].title}</th>)}</tr></thead><tbody>
        <tr><th>記録条件</th>{state.comparison.results.map(r => <td key={r.resultId}>{qualificationLabels[r.qualification.status]}</td>)}</tr>
        <tr><th>モデル</th>{state.comparison.results.map(r => <td key={r.resultId}>{r.measurement?.conditions.model ?? "不明"}</td>)}</tr>
        <tr><th>ルート応答のトークン</th>{state.comparison.results.map(r => <td key={r.resultId}>{formatNumber(r.measurement?.usage.totals.totalTokens ?? null)}</td>)}</tr>
        <tr><th>記録された時間</th>{state.comparison.results.map(r => <td key={r.resultId}>{formatDuration(r.measurement?.time.recordedTurnDurationMs ?? null)}</td>)}</tr>
        <tr><th>結果</th>{state.comparison.results.map(r => <td key={r.resultId}>{outcomeLabels[r.assessment.outcome]} ／ {provenanceLabels[r.assessment.provenance]}</td>)}</tr>
        <tr><th>採用版に算入</th>{state.comparison.results.map(r => <td key={r.resultId}>{r.acceptance.accepted ? "はい" : "いいえ"}</td>)}</tr>
      </tbody></table></div><p>採用版 {state.comparison.aggregate.acceptedCount}件 ／ 採用版1件あたり {formatNumber(state.comparison.aggregate.tokensPerAcceptedRun)} トークン</p>
      {state.comparison.aggregate.reasons.map(r => <p key={r} className="muted">集計できない理由：{r}</p>)}
      <p className="comparison-boundary">記録された範囲の比較です。完全な使用量、同じメモリ入力、送信時の全ファイルを証明するものではありません。</p></section>}
  </section>;
}
