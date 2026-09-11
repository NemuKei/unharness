import { Hangar } from '../Hangar';
import type { ArtworkItem, ArtworkImageLoader } from '../artwork';
import { validArtworkItem } from '../artwork';
import sample from '../../../assets/appearance-examples/cyber-persona-v1/artwork.json' with { type: 'json' };
import entityUrl from '../../../assets/appearance-examples/cyber-persona-v1/entity.png';

if (!validArtworkItem(sample) || sample.kind !== 'layered') throw Error('appearance-example-invalid');
const artwork: ArtworkItem = sample;
const entityId = sample.manifest.layers.entity.assetId;
const imageLoader: ArtworkImageLoader = async (asset, signal) => {
  if (asset.assetId !== entityId) throw Error('appearance-example-invalid');
  const response = await fetch(entityUrl, { signal, credentials: 'omit', cache: 'force-cache' });
  if (!response.ok) throw Error('appearance-example-unavailable');
  return response.blob();
};
const modes = [
  { label: 'Normal', subtitle: 'いつもの姿', condition: 'baseline' },
  { label: '限定解除', subtitle: '外装がほどける', condition: 'manual-only' },
  { label: '零式', subtitle: '本来の姿へ', condition: 'fixed-only' },
] as const;

export function OriginalAppearanceExample({ onInstall }: { onInstall: () => void }) {
  return <section className="original-example" aria-labelledby="original-example-title">
    <div className="original-example-heading">
      <div><p className="eyebrow">ORIGINAL PIXEL ART</p><h2 id="original-example-title">AIの姿も、<br/><span>自分仕様に。</span></h2></div>
      <div><p className="original-example-lead">メカも、美少女系のAI擬人化も。<br/>好きな姿を、いつものAIに。</p>
        <p>本体・外装・背景を作って組み合わせ、お気に入りのコレクションへ。選んだ姿は、モードや性能評価にかかわらず使い続けられます。</p></div>
    </div>
    <p className="original-example-scroll">横にスクロールして、3つの姿を見比べられます。</p>
    <div className="original-example-modes" role="region" aria-label="オリジナルAIの3モード表示" tabIndex={0}>
      {modes.map(mode => <figure key={mode.condition} aria-label={'オリジナルAIの作例：' + mode.label}>
        <Hangar condition={mode.condition} effects={false} artwork={artwork} imageLoader={imageLoader}/>
        <figcaption><strong>{mode.label}</strong><span>{mode.subtitle}</span></figcaption>
      </figure>)}
    </div>
    <div className="original-example-footer">
      <p>AIで描いた本体を、標準の外装・背景と組み合わせた作例です。ここでは外観だけをプレビューしています。</p>
      <button type="button" className="secondary" onClick={onInstall}>自分のオリジナルを作る</button>
    </div>
    <p className="original-example-note">作画は普段のAIと。画像の読み込み・合成・保存は、手元のPCで行います。</p>
  </section>;
}
