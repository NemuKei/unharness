import parseTweet from 'twitter-text/dist/parseTweet.js';
import { siteConfig } from './site-config.ts';

export type CardFields = { name: string; author: string; note: string };
export function cardFields(input: unknown): CardFields {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('invalid-card-fields');
  const value = input as Record<string, unknown>, keys = ['name', 'author', 'note'];
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw Error('invalid-card-fields');
  for (const key of keys) if (typeof value[key] !== 'string' || value[key].length > (key === 'note' ? 140 : 80)
    || /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(value[key])
    || key !== 'note' && value[key].includes('\n')) throw Error('invalid-card-fields');
  return { name: (value.name as string).trim(), author: (value.author as string).trim(), note: (value.note as string).trim() };
}
export function appearancePostText(name: string) {
  return ['Unharnessで、自分のAIの姿を作りました。', name.trim() ? `作品：${name.trim()}` : '', '#Unharness'].filter(Boolean).join('\n');
}
function publicUrl(url: string | null) {
  if (url === null) return null;
  const value = new URL(url);
  if (value.protocol !== 'https:' || value.username || value.password || value.hash
    || value.hostname === 'localhost' || value.hostname === '127.0.0.1' || value.hostname === '[::1]') throw Error('invalid-public-link');
  return value.href;
}
export function postLength(text: string, repositoryUrl: string | null) {
  const url = publicUrl(repositoryUrl);
  return parseTweet(text + (url ? '\n' + url : ''));
}
export function xIntent(text: string, repositoryUrl: string | null) {
  if (!postLength(text, repositoryUrl).valid) throw Error('invalid-post-text');
  const intent = new URL('https://x.com/intent/tweet'); intent.searchParams.set('text', text);
  const url = publicUrl(repositoryUrl); if (url) intent.searchParams.set('url', url);
  return intent.href;
}
export function cardAltText(fields: CardFields) {
  return ['Unharnessの外観カード。Normal、限定解除、零式の3つの姿を左から順に並べた画像。',
    fields.name ? `作品名：${fields.name}。` : '', fields.author ? `作者：${fields.author}。` : '', fields.note].filter(Boolean).join('');
}
function lines(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const result: string[] = []; let current = '';
  for (const character of text) {
    if (character === '\n') { result.push(current); current = ''; continue; }
    if (current && ctx.measureText(current + character).width > width) { result.push(current); current = ''; }
    current += character;
  }
  if (current) result.push(current);
  return result;
}
export async function renderAppearanceCard(images: string[], selectedFields: CardFields, signal: AbortSignal) {
  const fields = cardFields(selectedFields), bitmaps: ImageBitmap[] = [];
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 820;
  const ctx = canvas.getContext('2d'); if (!ctx) throw Error('card-render-unavailable');
  try {
    if (images.length !== 3) throw Error('card-render-unavailable');
    for (const image of images) {
      if (signal.aborted || !image.startsWith('data:image/png;base64,') || image.length > 12 * 1024 * 1024) throw Error('card-render-unavailable');
      const bytes = Uint8Array.from(atob(image.slice('data:image/png;base64,'.length)), character => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' })); bitmaps.push(bitmap);
      if (signal.aborted || bitmap.width !== 724 || bitmap.height !== 724) throw Error('card-render-unavailable');
    }
    await document.fonts.ready;
    if (signal.aborted) throw Error('card-render-unavailable');
    const font = '"Hiragino Sans", "Yu Gothic", sans-serif';
    ctx.fillStyle = '#08131a'; ctx.fillRect(0, 0, 1200, 820);
    ctx.fillStyle = '#bba572'; ctx.fillRect(40, 30, 48, 3);
    ctx.font = `600 18px ${font}`; ctx.fillStyle = '#a1b4be'; ctx.fillText('UNHARNESS / APPEARANCE', 104, 38);
    ctx.font = `600 28px ${font}`; ctx.fillStyle = '#edf1ec';
    const titleLines = lines(ctx, fields.name || 'AIの姿を、自分らしく。', 1120);
    if (titleLines.length > 2) throw Error('card-text-too-long');
    titleLines.forEach((line, index) => ctx.fillText(line, 40, 104 + index * 38));
    if (fields.author) { ctx.font = `18px ${font}`; ctx.fillStyle = '#b9c9cb'; ctx.fillText('Artwork by ' + fields.author, 40, 184, 1120); }
    const captions = ['Normal', '限定解除 — UNSEAL', '零式 — TRUEFORM'];
    bitmaps.forEach((bitmap, index) => {
      const x = 40 + index * 384;
      ctx.drawImage(bitmap, x, 214, 352, 352);
      ctx.strokeStyle = '#344751'; ctx.strokeRect(x + .5, 214.5, 351, 351);
      ctx.font = `500 19px ${font}`; ctx.fillStyle = '#d6e2df'; ctx.textAlign = 'center'; ctx.fillText(captions[index]!, x + 176, 602);
    });
    ctx.textAlign = 'left'; ctx.font = `22px ${font}`; ctx.fillStyle = '#b9c9cb';
    const noteLines = lines(ctx, fields.note, 1120);
    if (noteLines.length > 3) throw Error('card-text-too-long');
    noteLines.forEach((line, index) => ctx.fillText(line, 40, 651 + index * 29));
    ctx.strokeStyle = '#344751'; ctx.beginPath(); ctx.moveTo(40, 748); ctx.lineTo(1160, 748); ctx.stroke();
    ctx.font = `600 21px ${font}`; ctx.fillStyle = '#e7eee9'; ctx.fillText('Unharness', 40, 791);
    ctx.font = `16px ${font}`; ctx.fillStyle = '#94aab4'; ctx.textAlign = 'right'; ctx.fillText(`${siteConfig.author}  ·  ${siteConfig.authorUrl}`, 1160, 789);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('card-readback-failed')), 'image/png'));
    if (signal.aborted || blob.type !== 'image/png') throw Error('card-render-unavailable');
    return { blob, altText: cardAltText(fields), width: 1200, height: 820 };
  } finally { for (const bitmap of bitmaps) bitmap.close(); canvas.width = canvas.height = 0; }
}
