import { useState } from "react";
import { Hangar } from "../Hangar";
import { CopyRequest } from "./CopyRequest";
import type { SourceMode } from "../sources";
import { siteConfig, type MacCodexRelease } from "../site-config";
import { OriginalAppearanceExample } from './OriginalAppearanceExample';
import { publicModes, demoSources } from './public-modes';

export { publicModes } from './public-modes';
export function PublicModeChoices({ mode, choose }: { mode: SourceMode; choose: (mode: SourceMode) => void }) {
  return <div className="public-mode-choices" aria-label="モードのプレビュー">
    {(Object.keys(publicModes) as SourceMode[]).map(key => <button key={key} aria-pressed={key === mode} onClick={() => choose(key)}>
      <strong>{publicModes[key].title}</strong><span>{publicModes[key].label}</span>
    </button>)}
  </div>;
}
export function PublicEntry({ choose }: { choose: (page: "demo" | "install" | "connect") => void }) {
  return <main id="main" className="public-entry">
    <section className="entry-intro"><p className="eyebrow">まずは、Apple Silicon MacのCodex Desktopから。</p>
      <h1>モデルは変わった。<br/><span>装備は、そのまま？</span></h1>
      <p className="entry-promise"><span>書き直す前に、</span><span>一度外して使ってみる。</span></p>
      <p className="entry-lead">いつもの構成を保存して、選んだ追加指示を外したり、<br className="wide-only"/>自作・外部Skillの自動使用を抑えたり。<br className="wide-only"/>ふだんの仕事で試して、必要なら戻せます。</p>
      <p className="entry-context">モデルが変わったときも、仕事に合わないと感じたときも。</p>
      <nav className="entry-choices" aria-label="Unharnessの入口">
        <button className="primary" onClick={() => choose('demo')}>設定を変えずにデモを試す</button>
        <button className="secondary" onClick={() => choose('install')}>導入方法を見る</button>
      </nav>
      <button className="entry-returning" onClick={() => choose('connect')}>導入済みの方：接続して開く <span aria-hidden="true">↗</span></button>
      <p className="entry-boundary">無料・アカウント不要。設定と作品は手元のPCに。<br/>切り替えた構成は、新しいタスクで使います。</p>
    </section>
    <section className="entry-art" aria-label="標準外観のプレビュー"><Hangar condition="baseline" effects={false}/><p className="scene-caption">いつもの装備を残して、次の構成を試そう。</p></section>
    <section className="entry-journey" aria-labelledby="entry-journey-title">
      <p className="eyebrow">いつもの依頼で、使って確かめる。</p>
      <h2 id="entry-journey-title">外す。比べる。自分に合う形へ。</h2>
      <ol>
        <li><span aria-hidden="true">01</span><h3>いつもの構成を残す</h3><p>対象として確認した指示・Skillの構成をNormalに保存。戻れる基準を、先に用意します。</p></li>
        <li><span aria-hidden="true">02</span><h3>外した構成で使う</h3><p>モードを選び、新しいタスクでいつもの依頼を。<br/>自分の仕事に合うかを確かめます。</p></li>
        <li><span aria-hidden="true">03</span><h3>戻す。選び直す。</h3><p>必要なものを戻し、気に入った構成を保存。<br/>いつもの構成を選び直してもかまいません。</p></li>
      </ol>
    </section>
    <OriginalAppearanceExample onInstall={() => choose('install')}/>
    <section className="entry-availability" aria-labelledby="entry-availability-title">
      <p className="eyebrow">自分のAIで、はじめる。</p><h2 id="entry-availability-title">Mac版Codexから。次はWindowsへ。</h2>
      <PlatformRoadmap/>
      <p>初回はCodexに導入を頼み、いつもの構成を保存します。公開画面への接続は、自分のMacで許可して使います。</p>
      <button className="secondary" onClick={() => choose('install')}>Codexへの導入方法を見る</button>
      <SourceScope/>
    </section>
  </main>;
}
function PlatformRoadmap() {
  return <ol className="platform-roadmap" aria-label="対応状況と開発予定">
    <li><span>現在</span><strong>Mac版Codex</strong><small>Apple Silicon向けプレビュー</small></li>
    <li><span>次に取り組む予定</span><strong>Windows版Codex</strong><small>現在は配布対象外</small></li>
    <li><span>その後の対応目標</span><strong>Claude Code</strong><small>macOS・Windowsを目標に</small></li>
  </ol>;
}
function SourceScope() {
  return <details className="source-scope"><summary>変更するもの・保持するもの</summary>
    <dl><dt>変更するもの</dt><dd>自分で確認・選択した任意の追加指示と、通常の自作・外部Skill。Skillは無効・手動・自動を使い分けます。</dd>
      <dt>保持するもの</dt><dd>公式プラグイン、メモリ、作業の継続、プロジェクトの必須要件、実行権限、Unharnessの操作・復旧機能。</dd></dl>
    <p>初回Mac版では公式プラグインを元の状態で保持します。保存した構成へ戻す際は、独立して加えられた変更がないか確認します。</p>
    <p>軽い構成が、いつもよいとは限りません。外観はモードの演出で、性能向上を表すものではありません。普段使うAIの契約・使用量は別です。</p>
  </details>;
}
export function PublicDemo() {
  const [mode, choose] = useState<SourceMode>("normal"), selected = publicModes[mode], sample = demoSources[mode];
  return <main id="main" className="public-demo public-two-column"><section>
    <p className="eyebrow">導入前のデモ <span>／ サンプル</span></p><h1>{selected.title}</h1><p className="scene-subtitle">{selected.label}</p>
    <p className="entry-lead">{selected.description}</p>
    <PublicModeChoices mode={mode} choose={choose}/><Hangar condition={selected.scene} effects={false}/>
  </section><aside className="public-panel"><p className="eyebrow">このデモの架空の構成</p><h2>組み合わせを変えてみる。</h2>
    <dl className="demo-sources"><dt>追加した指示</dt><dd>{sample.instructions}</dd>
      <dt>公式プラグイン（例）</dt><dd>元の状態で保持する</dd>
      <dt>自作の手順Skill（例）</dt><dd>{sample.authoredSkill}</dd>
      <dt>使用頻度の低い外部Skill（例）</dt><dd>{sample.externalSkill}</dd>
      <dt>メモリ・作業の継続・実行権限</dt><dd>保持する</dd></dl>
    <p className="boundary">このデモは架空のデータです。モードを選んでも、あなたのAI設定は変わりません。</p>
    <p className="boundary">実際の切替対象はローカルで確認した追加指示と自作・外部Skillです。現行Codexでは公式プラグインの個別OFFが反映されないため、このMac版では保持します。</p>
    <p className="boundary">ここでは設定例と外観の変化を体験できます。実際に使うときは、新しいタスクでふだんの依頼を試し、自分に合うか確かめます。</p>
  </aside></main>;
}
function PublishedInstall({ release }: { release: MacCodexRelease }) {
  const request = `Unharness ${release.version}を、このMacで使うCodex Desktopへ導入してください。
公開配布物: ${release.archiveUrl}
ZIPのSHA-256: ${release.archiveSha256}
配布内容の識別子: ${release.distributionId}
ソースとライセンス: ${release.sourceUrl}

Apple SiliconのMacであることと、実際のCodex実行ファイル・使うプロファイル・プロジェクトを確認してください。不明な選択は私に確認してください。
上の公開配布物を取得し、実行前にZIPのSHA-256を照合してください。展開した「はじめに.md」の手順と同梱の検証処理を使い、配布内容の識別子まで照合して進めてください。別のURLや最新版を推測して使わないでください。
選択したCodexホームをCODEX_HOMEとして指定した子プロセスで導入し、既存の別マーケットプレイス、保存済みNormal、メモリ、作業継続、権限、必須のプロジェクト条件を保持してください。Nodeやnpmの追加導入、私によるコマンドの手入力は前提にしないでください。
導入後はUnharnessの管理Skillで接続先と独立した復旧コピーを確認し、ローカル画面を開いて初回のNormal保存まで案内してください。今のタスクにMCPがまだ見えない場合は、新しいタスクへの手順を案内してください。解除対象は私が確認して選びます。モードの準備と新規タスクへの反映、公開画面への接続許可は、それぞれ確認してください。`;
  return <div className="install-release">
    <h2>Codexに導入を頼む</h2>
    <p>バージョン {release.version} ／ Apple SiliconのMac向けです。Intel Macは未対応です。</p>
    <p>依頼文をコピーして、Codex Desktopに貼り付けてください。AIが配布物と導入先を確認して進めます。サイトからの直接インストールには対応していません。</p>
    <CopyRequest text={request} label="Codexへの導入依頼" button="導入依頼をコピー" />
    <details className="install-release-details"><summary>自分でダウンロード・配布物を確認</summary>
      <p>展開したフォルダをCodexへ渡し、「はじめに.md」の依頼文を使うこともできます。</p>
      <a className="secondary install-download" href={release.archiveUrl} referrerPolicy="no-referrer">Mac版ZIPをダウンロード</a>
      <p><a href={release.sourceUrl} target="_blank" rel="noopener noreferrer">ソースとライセンスを確認</a></p>
      <p>ZIPの照合値（SHA-256）<code>{release.archiveSha256}</code></p>
    </details>
  </div>;
}
export function PublicInstall({ release = siteConfig.macCodexRelease }: { release?: MacCodexRelease | null }) {
  const [application, setApplication] = useState("codex"), [os, setOs] = useState("mac");
  const target = os === "mac" && application === "codex";
  return <main id="main" className="public-install"><p className="eyebrow">導入の準備</p><h1>ふだんのAIから、開く。</h1>
    <p className="entry-lead">まずはMac版Codexから。Windows版Codexに続き、Claude Codeへの対応を目指します。</p>
    <div className="install-selectors"><label>使うAI<select aria-label="使うAI" value={application} onChange={e => setApplication(e.target.value)}><option value="codex">Codex Desktop</option><option value="claude">Claude Code</option></select></label>
      <label>使うOS<select aria-label="使うOS" value={os} onChange={e => setOs(e.target.value)}><option value="mac">macOS</option><option value="windows">Windows</option></select></label></div>
    <section className="public-panel">{target && release ? <PublishedInstall release={release}/> : <>
      <h2>{target ? "Mac版の公開配布を準備しています" : "この組み合わせは後続の対応です"}</h2>
      <p>{target ? "ローカルの実行環境・画面・管理Skillをまとめた配布物を検証中です。公開ダウンロードはまだ開始していません。"
        : application === 'codex' ? "Windows版Codexは、Mac版に続いて次に取り組む予定です。現在の配布はApple SiliconのMac向けです。"
        : "Claude CodeはWindows版Codexの後に取り組む予定です。macOS・Windowsの両方への対応を目指しています。現在の配布対象には含まれません。"}</p></>}
      {target && <ol><li>導入後、Codexに「アンハーネスを開いて」と頼みます。</li><li>ローカル画面で対象を確認し、今の構成をNormalに保存します。</li><li>解除対象を確認した後、新しいタスクで2つの構成をAIと相談します。</li></ol>}
      <p className="boundary">Unharnessの利用に、有料APIや設定を預ける運用サーバーは必要ありません。普段使うAIの契約・使用量は別です。</p>
      <SourceScope/>
    </section>
  </main>;
}
export function ConnectionInstructions() {
  return <div className="connection-instructions"><h2>導入済みなら、ローカルから許可する。</h2>
    <ol><li>Codexに依頼して、Unharnessのローカル画面を開きます。</li><li>接続先のサイト・対象・許可する操作を確認します。</li><li>許可後の一時リンクで、この画面を開きます。</li></ol>
    <CopyRequest text="アンハーネスのローカル画面を開いて、公開画面への接続許可を確認したいです。Unharnessのstatusで接続先を確認し、open_workbench、request_public_connectionの順でローカルの許可画面を開いてください。まだ許可やモード変更は行わないでください。" />
  </div>;
}
