import { useState } from "react";
import type { useSourceController } from "./useSourceController";
import { useStartingConditions } from "./useStartingConditions";
import type { StartingDeclaration, StartingFile, StartingSelection } from "./starting-conditions";
import { formatNumber } from "./comparisons";

type Draft = Omit<StartingDeclaration, "budget"> & { title: string; maxAttempts: string; maxTurns: string; maxTokens: string; additionalPaths: string };
const freshDraft = (): Draft => ({ title: "", request: "", requirements: [{ id: "requirement-1", label: "", critical: true }], ratings: [], maxAttempts: "1", maxTurns: "1", maxTokens: "", additionalPaths: "" });
const date = (value: string) => new Date(value).toLocaleString("ja-JP");
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
  return <details className="starting-files"><summary>保存対象のファイル（{files.length}件）</summary>
    <p className="muted">{selection.kind === "git-working-files" ? "未コミットの内容、無視されていない作業ファイル、プロジェクトの指示・設定を含みます。Git履歴と無視された他のファイルは除きます。" : "作業フォルダ内のファイルを保存します。"}{selection.additionalPaths.length > 0 && ` 追加指定：${selection.additionalPaths.length}件。`}</p>
    <div className="starting-file-list"><table><thead><tr><th>ファイル</th><th>状態</th><th>サイズ</th></tr></thead><tbody>{files.map(file => <tr key={file.path}><td>{file.path}</td><td>{file.present ? "保存対象" : "存在しない"}</td><td>{file.present ? size(file.size) : "—"}</td></tr>)}</tbody></table></div>
  </details>;
}
export function StartingConditions({ sourceController, onReplay }: { sourceController: ReturnType<typeof useSourceController>; onReplay?: (startId: string) => void }) {
  const [draft, setDraft] = useState(freshDraft);
  const starts = useStartingConditions(sourceController), { state } = starts;
  const declaration = declarationFor(draft);
  const disabled = sourceController.busy || !sourceController.confirmed;
  function change(next: Partial<Draft>) { setDraft(old => ({ ...old, ...next })); starts.invalidateReview(); }
  return <details className="comparison-panel starting-conditions">
    <summary>実行前に条件を保存</summary>
    <p className="muted">あとで同じ依頼を比較するため、依頼文・評価基準・元のファイルを固定します。ファイルはローカルに保存します。</p>
    <div className="starting-form">
      <label>条件の名前（任意）<input value={draft.title} maxLength={120} autoComplete="off" onChange={e => change({ title: e.target.value })} /></label>
      <div className="starting-field"><label htmlFor="starting-request-input">依頼文</label><textarea id="starting-request-input" rows={5} value={draft.request} maxLength={16384} onChange={e => change({ request: e.target.value })} /></div>
      <fieldset className="starting-criteria"><legend>必要な結果</legend>
        <p className="muted">合格に欠かせない結果を、1つ以上「必須」にします。</p>
        {draft.requirements.map((r, index) => <div className="starting-requirement" key={r.id}>
          <label>必要な結果 {index + 1}<input value={r.label} maxLength={160} onChange={e => change({ requirements: draft.requirements.map(item => item.id === r.id ? { ...item, label: e.target.value } : item) })} /></label>
          <label className="starting-checkbox"><input type="checkbox" checked={r.critical} onChange={e => change({ requirements: draft.requirements.map(item => item.id === r.id ? { ...item, critical: e.target.checked } : item) })} />必須</label>
          <button className="text-button" disabled={draft.requirements.length === 1} onClick={() => change({ requirements: draft.requirements.filter(item => item.id !== r.id) })} aria-label={`必要な結果 ${index + 1}を削除`}>削除</button>
        </div>)}
        <button className="text-button" disabled={draft.requirements.length >= 24} onClick={() => change({ requirements: [...draft.requirements, { id: `requirement-${crypto.randomUUID()}`, label: "", critical: false }] })}>結果の条件を追加</button>
      </fieldset>
      <details className="starting-ratings"><summary>主観評価の基準を追加（任意）</summary>
        {draft.ratings.map((r, index) => <div className="starting-rating" key={r.id}>
          <label>評価項目 {index + 1}<input maxLength={160} value={r.label} onChange={e => change({ ratings: draft.ratings.map(item => item.id === r.id ? { ...item, label: e.target.value } : item) })} /></label>
          <label>低い評価の状態<input maxLength={160} value={r.lowAnchor} onChange={e => change({ ratings: draft.ratings.map(item => item.id === r.id ? { ...item, lowAnchor: e.target.value } : item) })} /></label>
          <label>高い評価の状態<input maxLength={160} value={r.highAnchor} onChange={e => change({ ratings: draft.ratings.map(item => item.id === r.id ? { ...item, highAnchor: e.target.value } : item) })} /></label>
          <button className="text-button" onClick={() => change({ ratings: draft.ratings.filter(item => item.id !== r.id) })} aria-label={`評価項目 ${index + 1}を削除`}>削除</button>
        </div>)}
        <button className="text-button" disabled={draft.ratings.length >= 8} onClick={() => change({ ratings: [...draft.ratings, { id: `rating-${crypto.randomUUID()}`, label: "", lowAnchor: "", highAnchor: "" }] })}>評価項目を追加</button>
      </details>
      <fieldset><legend>比較を打ち切る上限</legend><div className="starting-budget">
        <label>試行上限（各モード）<input type="number" min={1} max={20} value={draft.maxAttempts} onChange={e => change({ maxAttempts: e.target.value })} /></label>
        <label>1試行のターン上限<input type="number" min={1} max={100} value={draft.maxTurns} onChange={e => change({ maxTurns: e.target.value })} /></label>
        <label>記録トークンの上限（任意）<input type="number" min={1} value={draft.maxTokens} placeholder="指定なし" onChange={e => change({ maxTokens: e.target.value })} /></label>
      </div><p className="muted">記録できるルート応答を基準にした上限です。アプリの使用枠を制限する設定ではありません。</p></fieldset>
      <details><summary>無視されたファイルなどを追加（任意）</summary><div className="starting-field"><label htmlFor="starting-additional-input">追加するファイル（相対パス・1行1件）</label><textarea id="starting-additional-input" value={draft.additionalPaths} maxLength={65536} rows={3} spellCheck={false} placeholder="data/example.csv" onChange={e => change({ additionalPaths: e.target.value })} /></div><p className="muted">この作業フォルダ内のファイルだけを追加できます。Git履歴は保存しません。</p></details>
      <p className="comparison-boundary">メモリと作業継続の設定を保持します。メモリ内容・外部ツール・キャッシュの同一性は、この保存では確認しません。</p>
      <button className="secondary" disabled={disabled || declaration === null} onClick={() => declaration && void starts.review(declaration, draft.additionalPaths.split(/\r?\n/).filter(path => path !== ""))}>保存内容を確認</button>
    </div>
    {state.review && <section className="starting-review" aria-label="保存前の確認">
      <h3>{state.review.title ?? "名称なしの開始条件"}</h3>
      <p>ファイル {state.review.fileCount}件 · {size(state.review.totalBytes)} · 必要な結果 {state.review.criteria.requirements.length}件</p>
      <p>試行 {state.review.criteria.budget.maxAttempts}回まで ／ 各 {state.review.criteria.budget.maxTurnsPerAttempt}ターンまで ／ トークン上限 {state.review.criteria.budget.maxRecordedTokens === null ? "指定なし" : formatNumber(state.review.criteria.budget.maxRecordedTokens)}</p>
      <FileReview files={state.review.files} selection={state.review.selection} />
      <button className="primary" disabled={disabled || state.lastSaved?.reviewId === state.review.reviewId} onClick={() => void starts.save()}>この開始条件を保存</button>
    </section>}
    {state.lastSaved && <p className="starting-saved" role="status">保存済み：{state.lastSaved.title ?? "名称なしの開始条件"}</p>}
    {state.notice && <p className="muted" role="status">{state.notice}</p>}
    {state.backgroundError && <p className="comparison-error" role="alert">{state.backgroundError}</p>}
    {state.error && <div className="comparison-error" role="alert">{state.error}{state.uncertain && <p>同じ保存操作を自動では繰り返しません。</p>}</div>}
    <section className="starting-history-section" aria-label="保存した開始条件">
      <div className="comparison-heading"><h3>保存した開始条件</h3><button className="text-button" disabled={disabled} onClick={() => void starts.load()}>保存した開始条件を読む</button></div>
      <ul className="starting-history">{state.starts.map(item => <li key={item.startId}><span><strong>{item.title ?? "名称なし"}</strong><small>{date(item.frozenAt)} ／ {item.fileCount}ファイル ／ {size(item.totalBytes)}</small></span><button className="text-button" disabled={disabled} onClick={() => void starts.read(item.startId)}>詳細を開く</button></li>)}</ul>
      {state.cursor && <button className="text-button" disabled={disabled} onClick={() => void starts.load(state.cursor!)}>開始条件の続きを表示</button>}
      {state.detail && <article className="starting-detail"><h3>{state.detail.title ?? "名称なしの開始条件"}</h3><p className="muted">{date(state.detail.frozenAt)} に固定した内容です。保存ファイルの整合性を確認しました。</p>
        <pre className="starting-request">{state.detail.declaration.request}</pre>
        <ul>{state.detail.declaration.requirements.map(r => <li key={r.id}>{r.label}{r.critical ? "（必須）" : ""}</li>)}</ul>
        {state.detail.declaration.ratings.map(r => <p key={r.id}>{r.label}：{r.lowAnchor} 〜 {r.highAnchor}</p>)}
        <FileReview files={state.detail.files} selection={state.detail.selection} />
        {state.detail.scopeId !== sourceController.view?.source?.registration.scopeId && <p className="muted">Skillの登録範囲を追加する前の開始条件です。「この条件から新しい入力を作る」で現在の範囲に保存し直せます。</p>}
        {onReplay && <button className="primary" disabled={disabled || state.detail.scopeId !== sourceController.view?.source?.registration.scopeId} onClick={() => onReplay(state.detail!.startId)}>この条件で再実行</button>}
        <button className="text-button" disabled={disabled} onClick={() => {
          const value = state.detail!.declaration;
          const { budget, ...input } = structuredClone(value);
          setDraft({ ...input, title: value.title ?? "", maxAttempts: String(budget.maxAttempts), maxTurns: String(budget.maxTurnsPerAttempt), maxTokens: budget.maxRecordedTokens === null ? "" : String(budget.maxRecordedTokens), additionalPaths: state.detail!.selection.additionalPaths.join("\n") });
          starts.invalidateReview();
        }}>この条件から新しい入力を作る</button>
      </article>}
    </section>
  </details>;
}
