import { text as t } from './locale.ts';
import { useState } from "react";
import type { useSourceController } from "./useSourceController";
import { useStartingConditions } from "./useStartingConditions";
import type { StartingDeclaration, StartingFile, StartingSelection } from "./starting-conditions";
import { formatNumber } from "./comparisons";

type Draft = Omit<StartingDeclaration, "budget"> & { title: string; maxAttempts: string; maxTurns: string; maxTokens: string; additionalPaths: string };
const freshDraft = (): Draft => ({ title: "", request: "", requirements: [{ id: "requirement-1", label: "", critical: true }], ratings: [], maxAttempts: "1", maxTurns: "1", maxTokens: "", additionalPaths: "" });
const date = (value: string) => new Date(value).toLocaleString(t("ja-JP", "en-US"));
const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
function declarationFor(draft: Draft): StartingDeclaration | null {
  const maxAttempts = Number(draft.maxAttempts), maxTurnsPerAttempt = Number(draft.maxTurns), maxRecordedTokens = draft.maxTokens.trim() ? Number(draft.maxTokens) : null;
  if (!draft.request.trim() || !draft.requirements.length || !draft.requirements.some(r => r.critical)
    || draft.requirements.some(r => !r.label.trim()) || draft.ratings.some(r => !r.label.trim() || !r.lowAnchor.trim() || !r.highAnchor.trim() || r.lowAnchor.trim() === r.highAnchor.trim())
    || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20 || !Number.isInteger(maxTurnsPerAttempt) || maxTurnsPerAttempt < 1 || maxTurnsPerAttempt > 100
    || maxRecordedTokens !== null && (!Number.isSafeInteger(maxRecordedTokens) || maxRecordedTokens < 1)) return null;
  return { request: draft.request, ...(draft.title.trim() ? { title: draft.title } : {}), requirements: draft.requirements, ratings: draft.ratings,
    budget: { maxAttempts, maxTurnsPerAttempt, maxRecordedTokens } };
}
function FileReview({ files, selection }: { files: StartingFile[]; selection: StartingSelection }) {
  return <details className="starting-files"><summary>{t("保存対象のファイル（", "Files to save (")}{files.length}{t("件）", ")")}</summary>
    <p className="muted">{selection.kind === "git-working-files" ? t("未コミットの内容、無視されていない作業ファイル、プロジェクトの指示・設定を含みます。Git履歴と無視された他のファイルは除きます。", "Includes uncommitted changes, non-ignored work files and project instructions/settings. Excludes Git history and other ignored files.") : t("作業フォルダ内のファイルを保存します。", "Save files in the project folder.")}{selection.additionalPaths.length > 0 && t(` 追加指定：${selection.additionalPaths.length}件。`, ` Extra files: ${selection.additionalPaths.length}.`)}</p>
    <div className="starting-file-list"><table><thead><tr><th>{t("ファイル ", "Files ")}</th><th>{t("状態", "State")}</th><th>{t("サイズ", "Size")}</th></tr></thead><tbody>{files.map(file => <tr key={file.path}><td>{file.path}</td><td>{file.present ? t("保存対象", "Included") : t("存在しない", "Missing")}</td><td>{file.present ? size(file.size) : "—"}</td></tr>)}</tbody></table></div>
  </details>;
}
export function StartingConditions({ sourceController, onReplay }: { sourceController: ReturnType<typeof useSourceController>; onReplay?: (startId: string) => void }) {
  const [draft, setDraft] = useState(freshDraft);
  const starts = useStartingConditions(sourceController), { state } = starts;
  const declaration = declarationFor(draft);
  const disabled = sourceController.busy || !sourceController.confirmed;
  function change(next: Partial<Draft>) { setDraft(old => ({ ...old, ...next })); starts.invalidateReview(); }
  return <details className="comparison-panel starting-conditions">
    <summary>{t("実行前に条件を保存", "Save conditions before starting")}</summary>
    <p className="muted">{t("あとで同じ依頼を比較するため、依頼文・評価基準・元のファイルを固定します。ファイルはローカルに保存します。", "Fix the request, criteria and starting files to compare the same work later. Files stay local.")}</p>
    <div className="starting-form">
      <label>{t("条件の名前（任意）", "Condition name (optional)")}<input value={draft.title} maxLength={120} autoComplete="off" onChange={e => change({ title: e.target.value })} /></label>
      <div className="starting-field"><label htmlFor="starting-request-input">{t("依頼文", "Request")}</label><textarea id="starting-request-input" rows={5} value={draft.request} maxLength={16384} onChange={e => change({ request: e.target.value })} /></div>
      <fieldset className="starting-criteria"><legend>{t("必要な結果 ", "Required outcomes ")}</legend>
        <p className="muted">{t("合格に欠かせない結果を、1つ以上「必須」にします。", "Mark at least one outcome as required for acceptance.")}</p>
        {draft.requirements.map((r, index) => <div className="starting-requirement" key={r.id}>
          <label>{t("必要な結果 ", "Required outcomes ")}{index + 1}<input value={r.label} maxLength={160} onChange={e => change({ requirements: draft.requirements.map(item => item.id === r.id ? { ...item, label: e.target.value } : item) })} /></label>
          <label className="starting-checkbox"><input type="checkbox" checked={r.critical} onChange={e => change({ requirements: draft.requirements.map(item => item.id === r.id ? { ...item, critical: e.target.checked } : item) })} />{t("必須", "Required")}</label>
          <button className="text-button" disabled={draft.requirements.length === 1} onClick={() => change({ requirements: draft.requirements.filter(item => item.id !== r.id) })} aria-label={t(`必要な結果 ${index + 1}を削除`, `Remove required outcome ${index + 1}`)}>{t("削除", "Remove")}</button>
        </div>)}
        <button className="text-button" disabled={draft.requirements.length >= 24} onClick={() => change({ requirements: [...draft.requirements, { id: `requirement-${crypto.randomUUID()}`, label: "", critical: false }] })}>{t("結果の条件を追加", "Add an outcome")}</button>
      </fieldset>
      <details className="starting-ratings"><summary>{t("主観評価の基準を追加（任意）", "Add subjective criteria (optional)")}</summary>
        {draft.ratings.map((r, index) => <div className="starting-rating" key={r.id}>
          <label>{t("評価項目 ", "Criterion ")}{index + 1}<input maxLength={160} value={r.label} onChange={e => change({ ratings: draft.ratings.map(item => item.id === r.id ? { ...item, label: e.target.value } : item) })} /></label>
          <label>{t("低い評価の状態", "Low-score description")}<input maxLength={160} value={r.lowAnchor} onChange={e => change({ ratings: draft.ratings.map(item => item.id === r.id ? { ...item, lowAnchor: e.target.value } : item) })} /></label>
          <label>{t("高い評価の状態", "High-score description")}<input maxLength={160} value={r.highAnchor} onChange={e => change({ ratings: draft.ratings.map(item => item.id === r.id ? { ...item, highAnchor: e.target.value } : item) })} /></label>
          <button className="text-button" onClick={() => change({ ratings: draft.ratings.filter(item => item.id !== r.id) })} aria-label={t(`評価項目 ${index + 1}を削除`, `Remove criterion ${index + 1}`)}>{t("削除", "Remove")}</button>
        </div>)}
        <button className="text-button" disabled={draft.ratings.length >= 8} onClick={() => change({ ratings: [...draft.ratings, { id: `rating-${crypto.randomUUID()}`, label: "", lowAnchor: "", highAnchor: "" }] })}>{t("評価項目を追加", "Add a criterion")}</button>
      </details>
      <fieldset><legend>{t("比較を打ち切る上限", "Comparison limits")}</legend><div className="starting-budget">
        <label>{t("試行上限（各モード）", "Attempt limit per mode")}<input type="number" min={1} max={20} value={draft.maxAttempts} onChange={e => change({ maxAttempts: e.target.value })} /></label>
        <label>{t("1試行のターン上限", "Turn limit per attempt")}<input type="number" min={1} max={100} value={draft.maxTurns} onChange={e => change({ maxTurns: e.target.value })} /></label>
        <label>{t("記録トークンの上限（任意）", "Recorded token limit (optional)")}<input type="number" min={1} value={draft.maxTokens} placeholder={t("指定なし", "None")} onChange={e => change({ maxTokens: e.target.value })} /></label>
      </div><p className="muted">{t("記録できるルート応答を基準にした上限です。アプリの使用枠を制限する設定ではありません。", "Limits apply to recorded root responses. They do not limit the app's usage allowance.")}</p></fieldset>
      <details><summary>{t("無視されたファイルなどを追加（任意）", "Add ignored or extra files (optional)")}</summary><div className="starting-field"><label htmlFor="starting-additional-input">{t("追加するファイル（相対パス・1行1件）", "Extra files (relative paths, one per line)")}</label><textarea id="starting-additional-input" value={draft.additionalPaths} maxLength={65536} rows={3} spellCheck={false} placeholder="data/example.csv" onChange={e => change({ additionalPaths: e.target.value })} /></div><p className="muted">{t("この作業フォルダ内のファイルだけを追加できます。Git履歴は保存しません。", "Only files within this project folder can be added. Git history is not saved.")}</p></details>
      <p className="comparison-boundary">{t("メモリと作業継続の設定を保持します。メモリ内容・外部ツール・キャッシュの同一性は、この保存では確認しません。", "Keep memory and task-continuity settings. Saving does not verify identical memory content, external tools or caches.")}</p>
      <button className="secondary" disabled={disabled || declaration === null} onClick={() => declaration && void starts.review(declaration, draft.additionalPaths.split(/\r?\n/).filter(path => path !== ""))}>{t("保存内容を確認", "Review before saving")}</button>
    </div>
    {state.review && <section className="starting-review" aria-label={t("保存前の確認", "Save review")}>
      <h3>{state.review.title ?? t("名称なしの開始条件", "Untitled starting conditions")}</h3>
      <p>{t("ファイル ", "Files ")}{state.review.fileCount}{t("件 · ", " items · ")}{size(state.review.totalBytes)} {t(" · 必要な結果 ", " · Outcomes: ")}{state.review.criteria.requirements.length}{t("件", " items")}</p>
      <p>{t("試行 ", "Attempts: ")}{state.review.criteria.budget.maxAttempts}{t("回まで ／ 各 ", " maximum / ")}{state.review.criteria.budget.maxTurnsPerAttempt}{t("ターンまで ／ トークン上限 ", " turns each / Token limit: ")}{state.review.criteria.budget.maxRecordedTokens === null ? t("指定なし", "None") : formatNumber(state.review.criteria.budget.maxRecordedTokens)}</p>
      <FileReview files={state.review.files} selection={state.review.selection} />
      <button className="primary" disabled={disabled || state.lastSaved?.reviewId === state.review.reviewId} onClick={() => void starts.save()}>{t("この開始条件を保存", "Save these starting conditions")}</button>
    </section>}
    {state.lastSaved && <p className="starting-saved" role="status">{t("保存済み：", "Saved: ")}{state.lastSaved.title ?? t("名称なしの開始条件", "Untitled starting conditions")}</p>}
    {state.notice && <p className="muted" role="status">{state.notice}</p>}
    {state.backgroundError && <p className="comparison-error" role="alert">{state.backgroundError}</p>}
    {state.error && <div className="comparison-error" role="alert">{state.error}{state.uncertain && <p>{t("同じ保存操作を自動では繰り返しません。", "The same save operation is not retried automatically.")}</p>}</div>}
    <section className="starting-history-section" aria-label={t("保存した開始条件", "Saved starting conditions")}>
      <div className="comparison-heading"><h3>{t("保存した開始条件", "Saved starting conditions")}</h3><button className="text-button" disabled={disabled} onClick={() => void starts.load()}>{t("保存した開始条件を読む", "Load saved starting conditions")}</button></div>
      <ul className="starting-history">{state.starts.map(item => <li key={item.startId}><span><strong>{item.title ?? t("名称なし", "Untitled")}</strong><small>{date(item.frozenAt)} ／ {item.fileCount}{t("ファイル ／ ", " files / ")}{size(item.totalBytes)}</small></span><button className="text-button" disabled={disabled} onClick={() => void starts.read(item.startId)}>{t("詳細を開く", "Open details")}</button></li>)}</ul>
      {state.cursor && <button className="text-button" disabled={disabled} onClick={() => void starts.load(state.cursor!)}>{t("開始条件の続きを表示", "Load more starting conditions")}</button>}
      {state.detail && <article className="starting-detail"><h3>{state.detail.title ?? t("名称なしの開始条件", "Untitled starting conditions")}</h3><p className="muted">{date(state.detail.frozenAt)} {t(" に固定した内容です。保存ファイルの整合性を確認しました。", " was the capture time. Saved file integrity was checked.")}</p>
        <pre className="starting-request">{state.detail.declaration.request}</pre>
        <ul>{state.detail.declaration.requirements.map(r => <li key={r.id}>{r.label}{r.critical ? t("（必須）", " (required)") : ""}</li>)}</ul>
        {state.detail.declaration.ratings.map(r => <p key={r.id}>{r.label}：{r.lowAnchor} 〜 {r.highAnchor}</p>)}
        <FileReview files={state.detail.files} selection={state.detail.selection} />
        {state.detail.scopeId !== sourceController.view?.source?.registration.scopeId && <p className="muted">{t("Skillの登録範囲を追加する前の開始条件です。「この条件から新しい入力を作る」で現在の範囲に保存し直せます。", "These conditions predate the expanded Skill scope. Create new input from these conditions to save for the current scope.")}</p>}
        {onReplay && <button className="primary" disabled={disabled || state.detail.scopeId !== sourceController.view?.source?.registration.scopeId} onClick={() => onReplay(state.detail!.startId)}>{t("この条件で再実行", "Replay these conditions")}</button>}
        <button className="text-button" disabled={disabled} onClick={() => {
          const value = state.detail!.declaration;
          const { budget, ...input } = structuredClone(value);
          setDraft({ ...input, title: value.title ?? "", maxAttempts: String(budget.maxAttempts), maxTurns: String(budget.maxTurnsPerAttempt), maxTokens: budget.maxRecordedTokens === null ? "" : String(budget.maxRecordedTokens), additionalPaths: state.detail!.selection.additionalPaths.join("\n") });
          starts.invalidateReview();
        }}>{t("この条件から新しい入力を作る", "Create new input from these conditions")}</button>
      </article>}
    </section>
  </details>;
}
