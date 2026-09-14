import { getLocale, text as t } from './locale.ts';
import { useEffect, useRef, useState } from 'react';
import type { AppearanceController } from './useAppearanceController';
import { artworkName } from './artwork';
import { renderArtworkImages } from './artwork-render';
import { appearancePostText, postLength, renderAppearanceCard, xIntent } from './artwork-card';
import { siteConfig } from './site-config';

export default function ArtworkCard({ controller: c }: { controller: AppearanceController }) {
  const locale = getLocale();
  const [item] = useState(() => c.view?.selectedItem ? structuredClone(c.view.selectedItem) : null);
  const [name, setName] = useState(''), [author, setAuthor] = useState(''), [note, setNote] = useState('');
  const [text, setText] = useState(appearancePostText('')), [textEdited, setTextEdited] = useState(false);
  const [includeLink, setIncludeLink] = useState(true), [poses, setPoses] = useState<string[] | null>(null);
  const [storedCard, setCard] = useState<{ blob: Blob; url: string; altText: string; fieldsKey: string } | null>(null);
  const [error, setError] = useState(''), [copyNotice, setCopyNotice] = useState(''), [openNotice, setOpenNotice] = useState('');
  const [textNotice, setTextNotice] = useState(''), [sharing, setSharing] = useState(false);
  const alive = useRef(true), generation = useRef(0), image = c.image;
  const fieldsKey = JSON.stringify([name, author, note, locale]), card = storedCard?.fieldsKey === fieldsKey ? storedCard : null;
  const publicLink = includeLink ? siteConfig.publicRepositoryUrl : null;
  const length = postLength(text, publicLink), intent = length.valid ? xIntent(text, publicLink) : null;
  useEffect(() => { alive.current = true; return () => { alive.current = false; ++generation.current; }; }, []);
  useEffect(() => {
    const signal = new AbortController(), key = c.key;
    void renderArtworkImages(item, item ? (asset, abort) => image(item.id, asset, abort, key) : undefined,
      ['baseline', 'manual-only', 'fixed-only'], signal.signal)
      .then(result => { if (!signal.signal.aborted) setPoses(result); })
      .catch(() => { if (!signal.signal.aborted) setError(t("作品の画像を確認できませんでした。接続と画像を確認して、カードを開き直してください。", "Could not verify the artwork images. Check the connection and images, then reopen the card.")); });
    return () => signal.abort();
  }, [item, c.key, image]);
  useEffect(() => {
    const signal = new AbortController(), epoch = ++generation.current;
    let url: string | null = null;
    setCard(null); setCopyNotice(''); setOpenNotice('');
    if (!poses) return;
    setError('');
    void renderAppearanceCard(poses, { name, author, note }, signal.signal)
      .then(result => {
        if (signal.signal.aborted || generation.current !== epoch) return;
        url = URL.createObjectURL(result.blob); setCard({ ...result, url, fieldsKey });
      })
      .catch(reason => { if (!signal.signal.aborted) setError(reason instanceof Error && reason.message === 'card-text-too-long'
        ? t("文字が画像に収まりません。作品名やひとことを短くしてください。", "The text does not fit. Shorten the artwork name or note.")
        : t("カード画像を書き出せませんでした。画像と文字を確認して、カードを開き直してください。", "Could not export the card. Check images and text, then reopen it.")); });
    return () => { signal.abort(); if (url) URL.revokeObjectURL(url); };
  }, [poses, name, author, note, locale]);
  useEffect(() => { if (!textEdited) setText(appearancePostText(name)); }, [locale, name, textEdited]);
  async function share() {
    if (!card || !intent || sharing) return;
    const snapshot = card, destination = intent, epoch = generation.current;
    setSharing(true); setCopyNotice(''); setOpenNotice('');
    try {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': snapshot.blob })]);
        if (alive.current) setCopyNotice(t("画像をコピーしました。Xで貼り付けてください。", "Image copied. Paste it into X."));
      } catch { if (alive.current) setCopyNotice(t("画像をコピーできませんでした。「画像を保存」から添付してください。", "Image copy failed. Save the image and attach it.")); }
      if (!alive.current || generation.current !== epoch) return;
      try {
        const popup = window.open('about:blank', '_blank');
        if (!popup) throw Error('popup-unconfirmed');
        popup.opener = null; popup.location.replace(destination);
        setOpenNotice(t("Xで画像を貼り付け、本文と画像の説明を確認して投稿してください。", "Paste the image in X and review the post and image description before posting."));
      } catch { setOpenNotice(t("Xの画面を開けませんでした。下のリンクから開いてください。", "Could not open X. Use the link below.")); }
    } finally { if (alive.current) setSharing(false); }
  }
  async function copyText(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setTextNotice(t(`${label}をコピーしました。クリップボードの画像は文字に置き換わりました。`, `${label} copied. Text has replaced the clipboard image.`)); }
    catch { setTextNotice(t("コピーできませんでした。文字を選択してコピーしてください。", "Copy failed. Select and copy the text.")); }
  }
  return <div className="art-card"><p>{t("このカードの作品：", "Artwork on this card: ")}{item ? artworkName(item) : t("標準の外観", "Default appearance")}</p>
    <p>{t("画像に載せる名前だけ入力してください。空欄の名前は載せません。", "Enter only names you want shown on the image. Blank names are omitted.")}</p>
    <div className="art-name-fields"><label>{t("公開する作品名（任意）", "Public artwork name (optional)")}<input value={name} maxLength={80} disabled={sharing} onChange={event => {
      setName(event.target.value); if (!textEdited) setText(appearancePostText(event.target.value));
    }}/></label><label>{t("公開する作者名（任意）", "Public author name (optional)")}<input value={author} maxLength={80} disabled={sharing} onChange={event => setAuthor(event.target.value)}/></label></div>
    <label>{t("画像に載せるひとこと（任意）", "Note on the image (optional)")}<textarea aria-label={t("画像に載せるひとこと（任意）", "Note on the image (optional)")} value={note} maxLength={140} rows={2} disabled={sharing} onChange={event => setNote(event.target.value)}/></label>
    {error ? <p role="alert" className="art-error">{error}</p> : !card && <p role="status">{t("カード画像を準備中…", "Preparing the card image…")}</p>}
    {card && <figure className="art-card-preview"><img src={card.url} alt={t("公開する外観カードのプレビュー", "Preview of the appearance card to share")}/><figcaption>{t("外観のカード ／ 性能の数値は含みません", "Appearance card / no performance metrics")}</figcaption></figure>}
    <label>{t("投稿文", "Post text")}<textarea aria-label={t("投稿文", "Post text")} value={text} maxLength={1000} rows={4} disabled={sharing} onChange={event => { setTextEdited(true); setText(event.target.value); }}/></label>
    {siteConfig.publicRepositoryUrl && <label className="art-card-link"><input type="checkbox" checked={includeLink} disabled={sharing} onChange={event => setIncludeLink(event.target.checked)}/>{t("公開リポジトリのリンクを付ける", "Include the public repository link")}<span>{siteConfig.publicRepositoryUrl}</span></label>}
    <p className={length.valid ? 'muted' : 'art-error'}>{length.weightedLength} {t(" / 280（Xの数え方）", " / 280 (X weighted count)")}{!length.valid && t(" — 投稿文を短くしてください。", " — Shorten the post text.")}</p>
    <div className="art-card-actions">{card && <a className="secondary" href={card.url} download="unharness-appearance.png">{t("画像を保存", "Save image")}</a>}
      <button className="primary" disabled={!card || !intent || sharing} onClick={() => void share()}>{sharing ? t("画像をコピー中…", "Copying image…") : t("画像をコピーしてXへ", "Copy image and open X")}</button></div>
    {copyNotice && <p role="status">{copyNotice}</p>}{openNotice && <p role="status">{openNotice}</p>}
    {intent && <a className="art-composer-link" href={intent} target="_blank" rel="noopener noreferrer">{t("Xの投稿画面を開く", "Open X composer")}</a>}
    <p className="muted">{t("Xでは画像を貼り付けてください。Command+V（Mac）／Ctrl+V（Windows）。投稿はXで確定します。", "Paste the image in X with Command+V (Mac) or Ctrl+V (Windows). Confirm publication in X.")}</p>
    {card && <label>{t("画像の説明", "Image description")}<textarea aria-label={t("画像の説明", "Image description")} value={card.altText} rows={3} readOnly/></label>}
    <div className="art-card-actions"><button className="secondary" disabled={sharing} onClick={() => void copyText(text + (publicLink ? '\n' + publicLink : ''), t("投稿文", "Post text"))}>{t("投稿文をコピー", "Copy post text")}</button>
      {card && <button className="secondary" disabled={sharing} onClick={() => void copyText(card.altText, t("画像の説明", "Image description"))}>{t("画像の説明をコピー", "Copy image description")}</button>}</div>
    <p className="muted">{t("文字をコピーすると、クリップボードの画像を置き換えます。", "Copying text replaces the clipboard image.")}</p>
    {textNotice && <p role="status">{textNotice}</p>}
  </div>;
}
