import { useEffect, useRef, useState } from 'react';
import type { AppearanceController } from './useAppearanceController';
import { artworkName } from './artwork';
import { renderArtworkImages } from './artwork-render';
import { appearancePostText, postLength, renderAppearanceCard, xIntent } from './artwork-card';
import { siteConfig } from './site-config';

export default function ArtworkCard({ controller: c }: { controller: AppearanceController }) {
  const [item] = useState(() => c.view?.selectedItem ? structuredClone(c.view.selectedItem) : null);
  const [name, setName] = useState(''), [author, setAuthor] = useState(''), [note, setNote] = useState('');
  const [text, setText] = useState(appearancePostText('')), [textEdited, setTextEdited] = useState(false);
  const [includeLink, setIncludeLink] = useState(true), [poses, setPoses] = useState<string[] | null>(null);
  const [storedCard, setCard] = useState<{ blob: Blob; url: string; altText: string; fieldsKey: string } | null>(null);
  const [error, setError] = useState(''), [copyNotice, setCopyNotice] = useState(''), [openNotice, setOpenNotice] = useState('');
  const [textNotice, setTextNotice] = useState(''), [sharing, setSharing] = useState(false);
  const alive = useRef(true), generation = useRef(0), image = c.image;
  const fieldsKey = JSON.stringify([name, author, note]), card = storedCard?.fieldsKey === fieldsKey ? storedCard : null;
  const publicLink = includeLink ? siteConfig.publicRepositoryUrl : null;
  const length = postLength(text, publicLink), intent = length.valid ? xIntent(text, publicLink) : null;
  useEffect(() => { alive.current = true; return () => { alive.current = false; ++generation.current; }; }, []);
  useEffect(() => {
    const signal = new AbortController(), key = c.key;
    void renderArtworkImages(item, item ? (asset, abort) => image(item.id, asset, abort, key) : undefined,
      ['baseline', 'manual-only', 'fixed-only'], signal.signal)
      .then(result => { if (!signal.signal.aborted) setPoses(result); })
      .catch(() => { if (!signal.signal.aborted) setError('作品の画像を確認できませんでした。接続と画像を確認して、カードを開き直してください。'); });
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
        ? '文字が画像に収まりません。作品名やひとことを短くしてください。'
        : 'カード画像を書き出せませんでした。画像と文字を確認して、カードを開き直してください。'); });
    return () => { signal.abort(); if (url) URL.revokeObjectURL(url); };
  }, [poses, name, author, note]);
  async function share() {
    if (!card || !intent || sharing) return;
    const snapshot = card, destination = intent, epoch = generation.current;
    setSharing(true); setCopyNotice(''); setOpenNotice('');
    try {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': snapshot.blob })]);
        if (alive.current) setCopyNotice('画像をコピーしました。Xで貼り付けてください。');
      } catch { if (alive.current) setCopyNotice('画像をコピーできませんでした。「画像を保存」から添付してください。'); }
      if (!alive.current || generation.current !== epoch) return;
      try {
        const popup = window.open('about:blank', '_blank');
        if (!popup) throw Error('popup-unconfirmed');
        popup.opener = null; popup.location.replace(destination);
        setOpenNotice('Xで画像を貼り付け、本文と画像の説明を確認して投稿してください。');
      } catch { setOpenNotice('Xの画面を開けませんでした。下のリンクから開いてください。'); }
    } finally { if (alive.current) setSharing(false); }
  }
  async function copyText(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setTextNotice(`${label}をコピーしました。クリップボードの画像は文字に置き換わりました。`); }
    catch { setTextNotice('コピーできませんでした。文字を選択してコピーしてください。'); }
  }
  return <div className="art-card"><p>このカードの作品：{item ? artworkName(item) : '標準の外観'}</p>
    <p>画像に載せる名前だけ入力してください。空欄の名前は載せません。</p>
    <div className="art-name-fields"><label>公開する作品名（任意）<input value={name} maxLength={80} disabled={sharing} onChange={event => {
      setName(event.target.value); if (!textEdited) setText(appearancePostText(event.target.value));
    }}/></label><label>公開する作者名（任意）<input value={author} maxLength={80} disabled={sharing} onChange={event => setAuthor(event.target.value)}/></label></div>
    <label>画像に載せるひとこと（任意）<textarea aria-label="画像に載せるひとこと（任意）" value={note} maxLength={140} rows={2} disabled={sharing} onChange={event => setNote(event.target.value)}/></label>
    {error ? <p role="alert" className="art-error">{error}</p> : !card && <p role="status">カード画像を準備中…</p>}
    {card && <figure className="art-card-preview"><img src={card.url} alt="公開する外観カードのプレビュー"/><figcaption>外観のカード ／ 性能の数値は含みません</figcaption></figure>}
    <label>投稿文<textarea aria-label="投稿文" value={text} maxLength={1000} rows={4} disabled={sharing} onChange={event => { setTextEdited(true); setText(event.target.value); }}/></label>
    {siteConfig.publicRepositoryUrl && <label className="art-card-link"><input type="checkbox" checked={includeLink} disabled={sharing} onChange={event => setIncludeLink(event.target.checked)}/>公開リポジトリのリンクを付ける<span>{siteConfig.publicRepositoryUrl}</span></label>}
    <p className={length.valid ? 'muted' : 'art-error'}>{length.weightedLength} / 280（Xの数え方）{!length.valid && ' — 投稿文を短くしてください。'}</p>
    <div className="art-card-actions">{card && <a className="secondary" href={card.url} download="unharness-appearance.png">画像を保存</a>}
      <button className="primary" disabled={!card || !intent || sharing} onClick={() => void share()}>{sharing ? '画像をコピー中…' : '画像をコピーしてXへ'}</button></div>
    {copyNotice && <p role="status">{copyNotice}</p>}{openNotice && <p role="status">{openNotice}</p>}
    {intent && <a className="art-composer-link" href={intent} target="_blank" rel="noopener noreferrer">Xの投稿画面を開く</a>}
    <p className="muted">Xでは画像を貼り付けてください。Command+V（Mac）／Ctrl+V（Windows）。投稿はXで確定します。</p>
    {card && <label>画像の説明<textarea aria-label="画像の説明" value={card.altText} rows={3} readOnly/></label>}
    <div className="art-card-actions"><button className="secondary" disabled={sharing} onClick={() => void copyText(text + (publicLink ? '\n' + publicLink : ''), '投稿文')}>投稿文をコピー</button>
      {card && <button className="secondary" disabled={sharing} onClick={() => void copyText(card.altText, '画像の説明')}>画像の説明をコピー</button>}</div>
    <p className="muted">文字をコピーすると、クリップボードの画像を置き換えます。</p>
    {textNotice && <p role="status">{textNotice}</p>}
  </div>;
}
