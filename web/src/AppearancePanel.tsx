import { getLocale, text as t } from './locale.ts';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CopyRequest } from './entry/CopyRequest';
import { LanguageSwitch } from './LanguageSwitch';
import { NativeDialog } from './ui/Dialog';
import { artworkName } from './artwork';
import type { ArtworkItem, ArtworkReview, ArtworkUpload, ArtworkImageLoader } from './artwork';
import { stockLayerManifest } from './appearance-layers';
import { Hangar } from './Hangar';
import {PreparedAppearanceOptions} from './PreparedAppearanceOptions';
import {readArtworkBase64} from './artwork-upload';
import { renderArtworkCollection, renderArtworkImages } from './artwork-render';
import type { AppearanceController } from './useAppearanceController';
import './artwork.css';
const ArtworkCard = lazy(() => import('./ArtworkCard'));

const partNames: Record<string, string> = {
  get 'arm-left-upper'() { return t("左上の支持部", "Upper left support"); }, get 'arm-left-middle'() { return t("左中央の支持部", "Middle left support"); }, get 'arm-left-lower'() { return t("左下の支持部", "Lower left support"); },
  get 'arm-right-upper'() { return t("右上の支持部", "Upper right support"); }, get 'arm-right-middle'() { return t("右中央の支持部", "Middle right support"); }, get 'arm-right-lower'() { return t("右下の支持部", "Lower right support"); },
  get 'panel-upper-left'() { return t("左上の装甲", "Upper left armor"); }, get 'panel-upper-right'() { return t("右上の装甲", "Upper right armor"); }, get 'panel-lower-left'() { return t("左下の装甲", "Lower left armor"); }, get 'panel-lower-right'() { return t("右下の装甲", "Lower right armor"); }, get glint() { return t("中央の光", "Central glow"); },
};
const modeNames = ['Normal', 'UNSEAL', 'TRUEFORM'];
function UploadedImage({ file }: { file: File | null }) {
  return file ? <div className="art-uploaded"><small>{file.name} ／ {(file.size / 1024).toFixed(0)} KiB</small></div> : <p className="art-keep">{t("変更せずに保持", "Keep unchanged")}</p>;
}
function CreationPrompt({ current }: { current: ArtworkItem | null }) {
  const choices = { entity: t('本体だけ', 'Entity only'), restraints: t('拘束具だけ', 'Restraints only'), background: t('背景だけ', 'Background only'), all: t('一式', 'Complete set') };
  const [brief, setBrief] = useState(''), [part, setPart] = useState<keyof typeof choices>('entity');
  const selectedPart = choices[part];
  const text = t(`$unharness-original を使い、Unharnessの${selectedPart}を作成したいです。${brief.trim() ? `希望は「${brief.trim()}」です。既に伝えた希望は引き継いでください。` : '作りたい姿を一緒に相談してください。'}\n${current?.kind === 'layered' ? `保持する作品は「${artworkName(current)}」（itemId: ${current.id}）です。` : '標準テンプレートを使うところから確認してください。'}未指定の部分を保持し、3モードで見た目を確認してから保存したいです。設定や比較記録は変更しないでください。`, `Use $unharness-original to help me create an Unharness appearance: ${selectedPart}. ${brief.trim() ? `My idea: “${brief.trim()}”. Preserve preferences I already shared.` : 'Discuss the look with me.'}\n${current?.kind === 'layered' ? `Retain the artwork “${artworkName(current)}” (itemId: ${current.id}). ` : 'Start by confirming the standard template. '}Keep unspecified parts and review all three mode appearances before saving. Do not change loadout settings or comparison records. Please guide me in English.`);
  return <div className="art-create"><p>{t("自分のAIと、好きな姿を相談できます。画像生成が使えない環境でも、手元の画像やローカルの描画を使えます。", "Discuss a look you love with your own AI. You can also use local images or drawing tools when image generation is unavailable.")}</p>
    <label>{t("作り替える部分", "Part to replace")}<select aria-label={t("作り替える部分", "Part to replace")} value={part} onChange={event => setPart(event.target.value as keyof typeof choices)}>{(Object.keys(choices) as Array<keyof typeof choices>).map(value => <option key={value} value={value}>{choices[value]}</option>)}</select></label>
    <label>{t("作りたいイメージ（任意）", "Your idea (optional)")}<textarea aria-label={t("作りたいイメージ（任意）", "Your idea (optional)")} value={brief} onChange={event => setBrief(event.target.value)} maxLength={1500} rows={4} placeholder={t("例：小さな金色の機械竜。背景と拘束具は今のまま。", "For example: a small golden mechanical dragon. Keep the current background and restraints.")}/></label>
    <CopyRequest text={text}/><p className="muted">{t("依頼文をコピーし、使っているAIへ渡してください。", "Copy the request and share it with your AI.")}</p>
  </div>;
}
function reviewItem(review: ArtworkReview): ArtworkItem {
  return { id: review.proposedItemId, kind: 'layered', name: review.name, author: review.author,
    parentItemId: review.baseItemId, manifest: review.manifest };
}
function ImportArtwork({ controller: c, close }: { controller: AppearanceController; close: () => void }) {
  const current = c.view?.selectedItem;
  const [name, setName] = useState(t("マイオリジナル", "My original")), [author, setAuthor] = useState('');
  const [base, setBase] = useState(current?.kind === 'layered' ? current.id : current ? '' : 'stock');
  const [entity, setEntity] = useState<File | null>(null), [background, setBackground] = useState<File | null>(null);
  const [restraints, setRestraints] = useState<Array<{ id: string; partId: string; file: File }>>([]);
  const [error, setError] = useState(''), [encoding, setEncoding] = useState(false), [previews, setPreviews] = useState<string[]>([]);
  const [rendering, setRendering] = useState(false), [renderError, setRenderError] = useState('');
  const [showMotion,setShowMotion]=useState(false);
  const [motionCondition,setMotionCondition]=useState<'baseline'|'manual-only'|'fixed-only'>('manual-only');
  const readController = useRef<AbortController | null>(null), previewHeading = useRef<HTMLHeadingElement>(null);
  const readImage = c.image;
  const reviewId=c.review?.reviewId;
  const motionArtwork=useMemo(()=>c.review ? reviewItem(c.review):null,[c.review]);
  const motionImage=useCallback<ArtworkImageLoader>((asset,signal)=>{
    if(!reviewId)throw Error('appearance-review-unavailable');
    return readImage(reviewId,asset,signal,c.key);
  },[reviewId,readImage,c.key]);
  useEffect(() => () => readController.current?.abort(), []);
  useEffect(() => {
    setPreviews([]); setRenderError(''); setShowMotion(false);
    if (!c.review) { setRendering(false); return; }
    const controller = new AbortController(), review = c.review, key = c.key;
    setRendering(true);
    void renderArtworkImages(reviewItem(review), (asset, signal) => readImage(review.reviewId, asset, signal, key),
      ['baseline', 'manual-only', 'fixed-only'], controller.signal)
      .then(images => { if (!controller.signal.aborted) { setPreviews(images); previewHeading.current?.focus(); } })
      .catch(() => { if (!controller.signal.aborted) setRenderError(t("3モードの合成表示を確認できませんでした。画像と接続を確認して、読み直してください。", "The three mode previews could not be verified. Check the images and connection, then reload.")); })
      .finally(() => { if (!controller.signal.aborted) setRendering(false); });
    return () => controller.abort();
  }, [c.review?.reviewId, c.key, readImage]);
  const blocked = c.mutating || c.uncertain || !c.confirmed || c.view?.recoveryRequired || encoding;
  function changeInput(change: () => void) { change(); c.clearReview(); setError(''); }
  async function review() {
    if (!c.view || blocked) return;
    const selected: Array<{ partId: string; file: File }> = [
      ...(entity ? [{ partId: 'entity-motion', file: entity }] : []), ...(background ? [{ partId: 'background', file: background }] : []),
      ...restraints.map(({ partId, file }) => ({ partId, file })),
    ];
    if (!base || !name.trim() || !selected.length || selected.some(row => !row.partId) || new Set(selected.map(row => row.partId)).size !== selected.length) {
      setError(t("作品名、保持する素材、読み込む画像と部品の対応を確認してください。", "Check the name, retained artwork, and how each image maps to a part.")); return;
    }
    if (selected.length > 64 || selected.some(row => row.file.size > 8 * 1024 * 1024) || selected.reduce((total, row) => total + row.file.size, 0) > 64 * 1024 * 1024) {
      setError(t("画像は1枚8 MiB、合計64 MiBまでです。", "Images are limited to 8 MiB each and 64 MiB in total.")); return;
    }
    const controller = new AbortController(); readController.current?.abort(); readController.current = controller;
    setEncoding(true); setError('');
    try {
      const files = [];
      for (const row of selected) files.push({ fileId: row.partId, base64: await readArtworkBase64(row.file, controller.signal) });
      if (controller.signal.aborted) return;
      const upload: ArtworkUpload = { importId: crypto.randomUUID(), expectedStateId: c.view.stateId,
        manifest: { templateId: stockLayerManifest.templateId, baseItemId: base === 'stock' ? null : base, name: name.trim(), author: author.trim(),
          parts: selected.map(row => ({ partId: row.partId, fileId: row.partId })) }, files };
      await c.reviewUpload(upload);
    } catch { if (!controller.signal.aborted) setError(t("画像を読み込めませんでした。ファイルを選び直してください。", "The image could not be read. Select the file again.")); }
    finally { if (!controller.signal.aborted) setEncoding(false); }
  }
  return <div className="art-import">
    <p>{t("変えたい部分だけ読み込めます。元の画像はそのまま残ります。", "Import just the parts you want to change. Original images remain unchanged.")}</p>
    <div className="art-name-fields"><label>{t("作品名", "Artwork name")}<input value={name} maxLength={80} disabled={blocked} onChange={event => changeInput(() => setName(event.target.value))}/></label>
      <label>{t("作者名（任意）", "Artist (optional)")}<input value={author} maxLength={80} disabled={blocked} onChange={event => changeInput(() => setAuthor(event.target.value))}/></label></div>
    <label>{t("保持する素材", "Artwork to retain")}<select value={base} disabled={blocked} onChange={event => changeInput(() => setBase(event.target.value))}>
      {!base && <option value="">{t("素材を選んでください", "Choose the base artwork")}</option>}
      {current?.kind === 'layered' && <option value={current.id}>{t("今の作品：", "Current artwork: ")}{artworkName(current)}</option>}
      <option value="stock">{t("標準のパーツ", "Standard parts")}</option>
    </select></label>
    {current?.kind === 'recipe' && <p className="muted">{t("この旧形式の外観は、そのままパーツとして引き継げません。新しい作品に使う素材を選んでください。以前の外観はコレクションに残ります。", "This older appearance cannot be reused directly as parts. Choose base artwork for the new version. The older appearance stays in your collection.")}</p>}
    <div className="art-part-inputs"><section><label>{t("本体のアニメーションPNG", "Entity animation PNG")}<input type="file" accept="image/png" disabled={blocked} onChange={event => changeInput(() => setEntity(event.target.files?.[0] ?? null))}/></label><UploadedImage file={entity}/><p className="muted">{t("Unharnessの制作ガイドに沿ってAIが用意した、12コマの透明PNGを選びます。コマ数・姿勢の順序・表示の大きさと速さはUnharnessが揃えます。", "Choose the transparent 12-frame PNG prepared with the Unharness authoring guide. Unharness uses a common frame count, pose order, scale and speed.")}</p></section>
      <section><label>{t("背景のPNG", "Background PNG")}<input type="file" accept="image/png" disabled={blocked} onChange={event => changeInput(() => setBackground(event.target.files?.[0] ?? null))}/></label><UploadedImage file={background}/></section></div>
    <details className="art-restraints"><summary>{t("拘束具を作り替える", "Replace restraints")}</summary><p className="muted">{t("支持部・装甲などの部品PNGを選び、AIから受け取った部品名に合わせます。", "Choose each support or armor PNG and match it to the part name supplied by your AI.")}</p>
      <label>{t("拘束具のPNG", "Restraint PNG")}<input type="file" accept="image/png" multiple disabled={blocked} onChange={event => {
        const files = [...(event.target.files ?? [])];
        if (files.length > 11) { setError(t("拘束具は11部品までです。", "Use up to 11 restraint parts.")); return; }
        changeInput(() => setRestraints(files.map(file => { const partId = file.name.replace(/\.png$/i, '');
          return { id: crypto.randomUUID(), file, partId: Object.hasOwn(partNames, partId) ? partId : '' }; })));
      }}/></label>
      {restraints.map(row => <div className="art-restraint-row" key={row.id}><span>{row.file.name}</span><label>{t("部品", "Part")}<select value={row.partId} disabled={blocked} onChange={event => changeInput(() => setRestraints(old => old.map(value => value.id === row.id ? { ...value, partId: event.target.value } : value)))}>
        <option value="">{t("部品を選択", "Choose a part")}</option>{Object.entries(partNames).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
      </select></label></div>)}
    </details>
    <p className="muted">{t("正方形の静止PNG、最大2048 px。1枚8 MiB、合計64 MiBまで。保存用コピーを724 pxに揃えます。", "Use square static PNGs up to 2048 px, 8 MiB each and 64 MiB total. Saved copies use a common 724 px size.")}</p>
    {(error || c.error) && <p className="art-error" role="alert">{error || c.error}</p>}
    <button className="secondary" disabled={blocked} onClick={() => void review()}>{encoding || c.mutating ? t("画像を確認中…", "Checking images…") : t("画像を確認", "Review images")}</button>
    {c.review && <section className="art-preview"><h3 ref={previewHeading} tabIndex={-1}>{t("3モードの見た目を確認", "Review all three modes")}</h3>
      <p>{c.review.name} ／ {c.review.replacedParts.map(part => part === 'entity-motion' ? t("本体のアニメーション", "Entity animation") : part === 'entity-poses' ? t("本体の3姿勢", "Three entity poses") : part === 'entity' ? t("本体", "Entity") : part === 'background' ? t("背景", "Background") : partNames[part]).join('・')}{t("を変更します。", " will change.")}</p>
      {rendering && <p role="status">{t("合成表示を準備中…", "Preparing previews…")}</p>}{renderError && <p className="art-error" role="alert">{renderError}</p>}
      <div className="art-preview-grid">{previews.map((url, index) => <figure key={modeNames[index]}><img src={url} alt={t(`${modeNames[index]}の合成プレビュー`, `${modeNames[index]} composition preview`)}/><figcaption>{modeNames[index]}</figcaption></figure>)}</div>
      {previews.length===3 && c.review.manifest.schemaVersion===2 && <>
        <button className="secondary" type="button" onClick={()=>setShowMotion(value=>!value)}>{showMotion?t("動きの確認を閉じる", "Close animation preview"):t("半覚醒と完全覚醒の動きを確認", "Preview partial and full awakening")}</button>
        {showMotion && <div><div className="art-motion-modes" role="group" aria-label={t("作品レビューのモード", "Artwork review mode")}>
          {(['baseline','manual-only','fixed-only'] as const).map((condition,index)=><button type="button" key={condition} aria-pressed={condition===motionCondition}
            onClick={()=>setMotionCondition(condition)}>{modeNames[index]}</button>)}
          </div><Hangar locale={getLocale()} condition={motionCondition} effects={true} artwork={motionArtwork} imageLoader={motionImage}/></div>}
      </>}
      <p className="muted">{t("このプレビューでは装備の設定を切り替えません。", "This preview does not change your loadout settings.")}</p>
      <button className="primary" disabled={blocked || rendering || previews.length !== 3 || !!renderError} onClick={async () => { if (await c.saveReview()) close(); }}>{t("この作品を保存", "Save this artwork")}</button>
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
  return <div className="art-collection"><p>{t("保存した作品と以前の版を、いつでも選べます。画像は零式での見た目です。", "Choose saved artwork and earlier versions at any time. Thumbnails show TRUEFORM.")}</p>
    {!rows.length && <p>{t("まだ作品はありません。「作品を読み込む」から保存できます。", "No artwork yet. Use Import artwork to add one.")}</p>}
    {failed.length > 0 && <p className="muted">{t("一部の画像を表示できませんでした。作品の記録は一覧から確認できます。", "Some images could not be displayed. Their records remain available in the list.")}</p>}
    <div className="art-collection-grid">{rows.map(row => <article key={row.id} className={c.view?.selectedItem?.id === row.id ? 'selected' : ''}>
      {images[row.id] ? <img src={images[row.id]} alt={t(`${artworkName(row)}の見た目`, `Appearance: ${artworkName(row)}`)}/> : <div className="art-thumb-placeholder">{failed.includes(row.id) ? t("画像を表示できません", "Image unavailable") : t("画像を準備中", "Preparing image")}</div>}
      <h3>{artworkName(row)}</h3><p>{row.kind === 'layered' ? row.parentItemId ? t("保存した別の版", "Another saved version") : t("オリジナル", "Original") : t("保存したプリセット", "Saved preset")}{row.author ? ` ／ ${row.author}` : ''}</p>
      <button className="secondary" disabled={c.mutating || c.uncertain || !c.confirmed || c.view?.recoveryRequired || c.view?.selectedItem?.id === row.id}
        onClick={async () => { if (await c.select(row.id)) close(); }}>{c.view?.selectedItem?.id === row.id ? t("選択中", "Selected") : t("この作品を選ぶ", "Select this artwork")}</button>
    </article>)}</div>
    {c.view?.nextCursor && <button className="secondary" disabled={c.busy} onClick={() => void c.load(c.view!.nextCursor!)}>{t("続きを表示", "Show more")}</button>}
    {failed.length > 0 && <button className="secondary" disabled={c.busy} onClick={() => setAttempt(value => value + 1)}>{t("画像を読み直す", "Reload images")}</button>}
  </div>;
}
export function AppearancePanel({ controller: c }: { controller: AppearanceController }) {
  const [panel, setPanel] = useState<'create' | 'import' | 'collection' | 'card' | null>(null);
  useEffect(() => { setPanel(null); }, [c.key]);
  const close = () => setPanel(null);
  const unavailable = !c.enabled || !c.confirmed || c.mutating || c.uncertain || c.view?.recoveryRequired;
  return <section className="artwork-panel" aria-label={t("見た目とコレクション", "Appearance and collection")}><div className="artwork-panel-heading"><span>{t("見た目", "Appearance")}</span>
    <strong>{c.view?.selectedItem ? artworkName(c.view.selectedItem) : t("標準の外観", "Standard appearance")}</strong></div>
    <PreparedAppearanceOptions controller={c}/>
    <div className="artwork-actions"><button onClick={() => setPanel('create')}>{t("オリジナルイメージを作成", "Create original artwork")}</button>
      <button disabled={unavailable} onClick={() => { c.clearReview(); setPanel('import'); }}>{t("作品を読み込む", "Import artwork")}</button>
      <button disabled={!c.enabled || !c.confirmed || c.mutating} onClick={() => setPanel('collection')}>{t("コレクション", "Collection")}</button>
      <button disabled={unavailable} onClick={() => setPanel('card')}>{t("画像カード", "Image card")}</button></div>
    {c.notice && <p role="status" className="art-notice">{c.notice}</p>}
    {c.error && <p role="alert" className="art-error">{c.error}</p>}
    {!c.enabled && <p className="muted">{t("作品の保存には、ローカルへの接続が必要です。", "Saving artwork requires a local connection.")}</p>}
    {c.view?.recoveryRequired && <button className="secondary" disabled={c.busy} onClick={() => void c.recover()}>{t("作品の保存を復旧", "Recover artwork saving")}</button>}
    {c.uncertain && <button className="secondary" disabled={c.busy} onClick={() => void c.retry()}>{t("同じ作品操作の結果を確認", "Check the same artwork operation")}</button>}
    {c.error && <button className="secondary" disabled={c.busy} onClick={() => void c.load()}>{t("外観を読み直す", "Reload appearance")}</button>}
    {c.operationId && c.uncertain && <details><summary>{t("作品操作のID", "Artwork operation ID")}</summary><code>{c.operationId}</code></details>}
    <NativeDialog className="art-dialog ui-dialog" open={panel !== null} onOpenChange={open => { if (!open) close(); }} aria-labelledby="art-dialog-title">
      <header className="art-dialog-header"><h2 id="art-dialog-title">{panel === 'create' ? t("オリジナルイメージを作成", "Create original artwork") : panel === 'import' ? t("作品を読み込む", "Import artwork") : panel === 'card' ? t("画像カード", "Image card") : t("コレクション", "Collection")}</h2>
        <LanguageSwitch/><button onClick={close} aria-label={t("外観の画面を閉じる", "Close appearance")}>{t("閉じる", "Close")}</button></header>
      <div className="art-dialog-body">{panel === 'create' ? <CreationPrompt current={c.view?.selectedItem ?? null}/>
        : panel === 'import' ? <ImportArtwork controller={c} close={close}/>
          : panel === 'collection' ? <Collection controller={c} close={close}/>
            : panel === 'card' ? <Suspense fallback={<p>{t("カード画面を開いています…", "Opening the card editor…")}</p>}><ArtworkCard controller={c}/></Suspense> : null}</div>
    </NativeDialog>
  </section>;
}
