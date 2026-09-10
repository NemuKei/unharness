import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CopyRequest } from './entry/CopyRequest';
import { artworkName } from './artwork';
import type { ArtworkItem, ArtworkReview, ArtworkUpload } from './artwork';
import { stockLayerManifest } from './appearance-layers';
import { renderArtworkCollection, renderArtworkImages } from './artwork-render';
import type { AppearanceController } from './useAppearanceController';
import './artwork.css';
const ArtworkCard = lazy(() => import('./ArtworkCard'));

const partNames: Record<string, string> = {
  'arm-left-upper': '左上の支持部', 'arm-left-middle': '左中央の支持部', 'arm-left-lower': '左下の支持部',
  'arm-right-upper': '右上の支持部', 'arm-right-middle': '右中央の支持部', 'arm-right-lower': '右下の支持部',
  'panel-upper-left': '左上の装甲', 'panel-upper-right': '右上の装甲', 'panel-lower-left': '左下の装甲', 'panel-lower-right': '右下の装甲', glint: '中央の光',
};
const modeNames = ['Normal', 'UNSEAL', 'TRUEFORM'];
function UploadedImage({ file }: { file: File | null }) {
  return file ? <div className="art-uploaded"><small>{file.name} ／ {(file.size / 1024).toFixed(0)} KiB</small></div> : <p className="art-keep">変更せずに保持</p>;
}
function readBase64(file: File, signal: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => { reader.abort(); reject(new Error('cancelled')); };
    if (signal.aborted) { reject(new Error('cancelled')); return; }
    signal.addEventListener('abort', abort, { once: true });
    reader.onloadend = () => {
      signal.removeEventListener('abort', abort);
      if (reader.error || typeof reader.result !== 'string') reject(new Error('image-read-failed'));
      else resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}
function CreationPrompt({ current }: { current: ArtworkItem | null }) {
  const [brief, setBrief] = useState(''), [part, setPart] = useState('本体だけ');
  const text = `$unharness-original を使い、Unharnessの${part}を作成したいです。${brief.trim() ? `希望は「${brief.trim()}」です。既に伝えた希望は引き継いでください。` : '作りたい姿を一緒に相談してください。'}\n${current?.kind === 'layered' ? `保持する作品は「${artworkName(current)}」（itemId: ${current.id}）です。` : '標準テンプレートを使うところから確認してください。'}未指定の部分を保持し、3モードで見た目を確認してから保存したいです。設定や比較記録は変更しないでください。`;
  return <div className="art-create"><p>自分のAIと、好きな姿を相談できます。画像生成が使えない環境でも、手元の画像やローカルの描画を使えます。</p>
    <label>作り替える部分<select value={part} onChange={event => setPart(event.target.value)}>{['本体だけ', '拘束具だけ', '背景だけ', '一式'].map(value => <option key={value}>{value}</option>)}</select></label>
    <label>作りたいイメージ（任意）<textarea aria-label="作りたいイメージ（任意）" value={brief} onChange={event => setBrief(event.target.value)} maxLength={1500} rows={4} placeholder="例：小さな金色の機械竜。背景と拘束具は今のまま。"/></label>
    <CopyRequest text={text}/><p className="muted">依頼文をコピーし、使っているAIへ渡してください。</p>
  </div>;
}
function reviewItem(review: ArtworkReview): ArtworkItem {
  return { id: review.proposedItemId, kind: 'layered', name: review.name, author: review.author,
    parentItemId: review.baseItemId, manifest: review.manifest };
}
function ImportArtwork({ controller: c, close }: { controller: AppearanceController; close: () => void }) {
  const current = c.view?.selectedItem;
  const [name, setName] = useState('マイオリジナル'), [author, setAuthor] = useState('');
  const [base, setBase] = useState(current?.kind === 'layered' ? current.id : current ? '' : 'stock');
  const [entity, setEntity] = useState<File | null>(null), [background, setBackground] = useState<File | null>(null);
  const [restraints, setRestraints] = useState<Array<{ id: string; partId: string; file: File }>>([]);
  const [error, setError] = useState(''), [encoding, setEncoding] = useState(false), [previews, setPreviews] = useState<string[]>([]);
  const [rendering, setRendering] = useState(false), [renderError, setRenderError] = useState('');
  const readController = useRef<AbortController | null>(null), previewHeading = useRef<HTMLHeadingElement>(null);
  const readImage = c.image;
  useEffect(() => () => readController.current?.abort(), []);
  useEffect(() => {
    setPreviews([]); setRenderError('');
    if (!c.review) { setRendering(false); return; }
    const controller = new AbortController(), review = c.review, key = c.key;
    setRendering(true);
    void renderArtworkImages(reviewItem(review), (asset, signal) => readImage(review.reviewId, asset, signal, key),
      ['baseline', 'manual-only', 'fixed-only'], controller.signal)
      .then(images => { if (!controller.signal.aborted) { setPreviews(images); previewHeading.current?.focus(); } })
      .catch(() => { if (!controller.signal.aborted) setRenderError('3モードの合成表示を確認できませんでした。画像と接続を確認して、読み直してください。'); })
      .finally(() => { if (!controller.signal.aborted) setRendering(false); });
    return () => controller.abort();
  }, [c.review?.reviewId, c.key, readImage]);
  const blocked = c.mutating || c.uncertain || !c.confirmed || c.view?.recoveryRequired || encoding;
  function changeInput(change: () => void) { change(); c.clearReview(); setError(''); }
  async function review() {
    if (!c.view || blocked) return;
    const selected: Array<{ partId: string; file: File }> = [
      ...(entity ? [{ partId: 'entity', file: entity }] : []), ...(background ? [{ partId: 'background', file: background }] : []),
      ...restraints.map(({ partId, file }) => ({ partId, file })),
    ];
    if (!base || !name.trim() || !selected.length || selected.some(row => !row.partId) || new Set(selected.map(row => row.partId)).size !== selected.length) {
      setError('作品名、保持する素材、読み込む画像と部品の対応を確認してください。'); return;
    }
    if (selected.length > 64 || selected.some(row => row.file.size > 8 * 1024 * 1024) || selected.reduce((total, row) => total + row.file.size, 0) > 64 * 1024 * 1024) {
      setError('画像は1枚8 MiB、合計64 MiBまでです。'); return;
    }
    const controller = new AbortController(); readController.current?.abort(); readController.current = controller;
    setEncoding(true); setError('');
    try {
      const files = [];
      for (const row of selected) files.push({ fileId: row.partId, base64: await readBase64(row.file, controller.signal) });
      if (controller.signal.aborted) return;
      const upload: ArtworkUpload = { importId: crypto.randomUUID(), expectedStateId: c.view.stateId,
        manifest: { templateId: stockLayerManifest.templateId, baseItemId: base === 'stock' ? null : base, name: name.trim(), author: author.trim(),
          parts: selected.map(row => ({ partId: row.partId, fileId: row.partId })) }, files };
      await c.reviewUpload(upload);
    } catch { if (!controller.signal.aborted) setError('画像を読み込めませんでした。ファイルを選び直してください。'); }
    finally { if (!controller.signal.aborted) setEncoding(false); }
  }
  return <div className="art-import">
    <p>変えたい部分だけ読み込めます。元の画像はそのまま残ります。</p>
    <div className="art-name-fields"><label>作品名<input value={name} maxLength={80} disabled={blocked} onChange={event => changeInput(() => setName(event.target.value))}/></label>
      <label>作者名（任意）<input value={author} maxLength={80} disabled={blocked} onChange={event => changeInput(() => setAuthor(event.target.value))}/></label></div>
    <label>保持する素材<select value={base} disabled={blocked} onChange={event => changeInput(() => setBase(event.target.value))}>
      {!base && <option value="">素材を選んでください</option>}
      {current?.kind === 'layered' && <option value={current.id}>今の作品：{artworkName(current)}</option>}
      <option value="stock">標準のパーツ</option>
    </select></label>
    {current?.kind === 'recipe' && <p className="muted">この旧形式の外観は、そのままパーツとして引き継げません。新しい作品に使う素材を選んでください。以前の外観はコレクションに残ります。</p>}
    <div className="art-part-inputs"><section><label>本体のPNG<input type="file" accept="image/png" disabled={blocked} onChange={event => changeInput(() => setEntity(event.target.files?.[0] ?? null))}/></label><UploadedImage file={entity}/></section>
      <section><label>背景のPNG<input type="file" accept="image/png" disabled={blocked} onChange={event => changeInput(() => setBackground(event.target.files?.[0] ?? null))}/></label><UploadedImage file={background}/></section></div>
    <details className="art-restraints"><summary>拘束具を作り替える</summary><p className="muted">支持部・装甲などの部品PNGを選び、AIから受け取った部品名に合わせます。</p>
      <label>拘束具のPNG<input type="file" accept="image/png" multiple disabled={blocked} onChange={event => {
        const files = [...(event.target.files ?? [])];
        if (files.length > 11) { setError('拘束具は11部品までです。'); return; }
        changeInput(() => setRestraints(files.map(file => { const partId = file.name.replace(/\.png$/i, '');
          return { id: crypto.randomUUID(), file, partId: Object.hasOwn(partNames, partId) ? partId : '' }; })));
      }}/></label>
      {restraints.map(row => <div className="art-restraint-row" key={row.id}><span>{row.file.name}</span><label>部品<select value={row.partId} disabled={blocked} onChange={event => changeInput(() => setRestraints(old => old.map(value => value.id === row.id ? { ...value, partId: event.target.value } : value)))}>
        <option value="">部品を選択</option>{Object.entries(partNames).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
      </select></label></div>)}
    </details>
    <p className="muted">正方形の静止PNG、最大2048 px。1枚8 MiB、合計64 MiBまで。保存用コピーを724 pxに揃えます。</p>
    {(error || c.error) && <p className="art-error" role="alert">{error || c.error}</p>}
    <button className="secondary" disabled={blocked} onClick={() => void review()}>{encoding || c.mutating ? '画像を確認中…' : '画像を確認'}</button>
    {c.review && <section className="art-preview"><h3 ref={previewHeading} tabIndex={-1}>3モードの見た目を確認</h3>
      <p>{c.review.name} ／ {c.review.replacedParts.map(part => part === 'entity' ? '本体' : part === 'background' ? '背景' : partNames[part]).join('・')}を変更します。</p>
      {rendering && <p role="status">合成表示を準備中…</p>}{renderError && <p className="art-error" role="alert">{renderError}</p>}
      <div className="art-preview-grid">{previews.map((url, index) => <figure key={modeNames[index]}><img src={url} alt={`${modeNames[index]}の合成プレビュー`}/><figcaption>{modeNames[index]}</figcaption></figure>)}</div>
      <p className="muted">このプレビューでは装備の設定を切り替えません。</p>
      <button className="primary" disabled={blocked || rendering || previews.length !== 3 || !!renderError} onClick={async () => { if (await c.saveReview()) close(); }}>この作品を保存</button>
    </section>}
  </div>;
}
function Collection({ controller: c, close }: { controller: AppearanceController; close: () => void }) {
  const [images, setImages] = useState<Record<string, string>>({}), [failed, setFailed] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const rows = c.view?.collection ?? [], signature = rows.map(row => row.id).join(':');
  useEffect(() => {
    const controller = new AbortController(), key = c.key;
    setFailed([]);
    void renderArtworkCollection(rows.map(row => row.id), c.item, id => (asset, signal) => c.image(id, asset, signal, key), controller.signal,
      (id, url) => { if (!controller.signal.aborted) setImages(old => ({ ...old, [id]: url })); },
      id => {
        if (controller.signal.aborted) return;
        setImages(old => { const next = { ...old }; delete next[id]; return next; });
        setFailed(old => [...old, id]);
      })
      .catch(() => { if (!controller.signal.aborted) { setImages({}); setFailed(rows.map(row => row.id)); } });
    return () => controller.abort();
  }, [signature, c.key, attempt]);
  return <div className="art-collection"><p>保存した作品と以前の版を、いつでも選べます。画像は零式での見た目です。</p>
    {!rows.length && <p>まだ作品はありません。「作品を読み込む」から保存できます。</p>}
    {failed.length > 0 && <p className="muted">一部の画像を表示できませんでした。作品の記録は一覧から確認できます。</p>}
    <div className="art-collection-grid">{rows.map(row => <article key={row.id} className={c.view?.selectedItem?.id === row.id ? 'selected' : ''}>
      {images[row.id] ? <img src={images[row.id]} alt={`${artworkName(row)}の見た目`}/> : <div className="art-thumb-placeholder">{failed.includes(row.id) ? '画像を表示できません' : '画像を準備中'}</div>}
      <h3>{artworkName(row)}</h3><p>{row.kind === 'layered' ? row.parentItemId ? '保存した別の版' : 'オリジナル' : '保存したプリセット'}{row.author ? ` ／ ${row.author}` : ''}</p>
      <button className="secondary" disabled={c.mutating || c.uncertain || !c.confirmed || c.view?.recoveryRequired || c.view?.selectedItem?.id === row.id}
        onClick={async () => { if (await c.select(row.id)) close(); }}>{c.view?.selectedItem?.id === row.id ? '選択中' : 'この作品を選ぶ'}</button>
    </article>)}</div>
    {c.view?.nextCursor && <button className="secondary" disabled={c.busy} onClick={() => void c.load(c.view!.nextCursor!)}>続きを表示</button>}
    {failed.length > 0 && <button className="secondary" disabled={c.busy} onClick={() => setAttempt(value => value + 1)}>画像を読み直す</button>}
  </div>;
}
export function AppearancePanel({ controller: c }: { controller: AppearanceController }) {
  const [panel, setPanel] = useState<'create' | 'import' | 'collection' | 'card' | null>(null), dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { setPanel(null); }, [c.key]);
  useEffect(() => {
    const element = dialog.current; if (!element) return;
    if (panel && !element.open) element.showModal();
    else if (!panel && element.open) element.close();
  }, [panel]);
  const close = () => setPanel(null);
  const unavailable = !c.enabled || !c.confirmed || c.mutating || c.uncertain || c.view?.recoveryRequired;
  return <section className="artwork-panel" aria-label="見た目とコレクション"><div className="artwork-panel-heading"><span>見た目</span>
    <strong>{c.view?.selectedItem ? artworkName(c.view.selectedItem) : '標準の外観'}</strong></div>
    <div className="artwork-actions"><button onClick={() => setPanel('create')}>オリジナルイメージを作成</button>
      <button disabled={unavailable} onClick={() => { c.clearReview(); setPanel('import'); }}>作品を読み込む</button>
      <button disabled={!c.enabled || !c.confirmed || c.mutating} onClick={() => setPanel('collection')}>コレクション</button>
      <button disabled={unavailable} onClick={() => setPanel('card')}>画像カード</button></div>
    {c.notice && <p role="status" className="art-notice">{c.notice}</p>}
    {c.error && <p role="alert" className="art-error">{c.error}</p>}
    {!c.enabled && <p className="muted">作品の保存には、ローカルへの接続が必要です。</p>}
    {c.view?.recoveryRequired && <button className="secondary" disabled={c.busy} onClick={() => void c.recover()}>作品の保存を復旧</button>}
    {c.uncertain && <button className="secondary" disabled={c.busy} onClick={() => void c.retry()}>同じ作品操作の結果を確認</button>}
    {c.error && <button className="secondary" disabled={c.busy} onClick={() => void c.load()}>外観を読み直す</button>}
    {c.operationId && c.uncertain && <details><summary>作品操作のID</summary><code>{c.operationId}</code></details>}
    <dialog className="art-dialog" ref={dialog} onCancel={close} onClose={close} aria-labelledby="art-dialog-title">
      <header className="art-dialog-header"><h2 id="art-dialog-title">{panel === 'create' ? 'オリジナルイメージを作成' : panel === 'import' ? '作品を読み込む' : panel === 'card' ? '画像カード' : 'コレクション'}</h2>
        <button onClick={close} aria-label="外観の画面を閉じる">閉じる</button></header>
      <div className="art-dialog-body">{panel === 'create' ? <CreationPrompt current={c.view?.selectedItem ?? null}/>
        : panel === 'import' ? <ImportArtwork controller={c} close={close}/>
          : panel === 'collection' ? <Collection controller={c} close={close}/>
            : panel === 'card' ? <Suspense fallback={<p>カード画面を開いています…</p>}><ArtworkCard controller={c}/></Suspense> : null}</div>
    </dialog>
  </section>;
}
