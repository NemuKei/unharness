import { GuidedExperience } from './GuidedExperience';
import './guided-demo.css';
import { useState } from "react";
import { Hangar } from "../Hangar";
import { CopyRequest } from "./CopyRequest";
import type { SourceMode } from "../sources";
import { siteConfig, type MacCodexRelease } from "../site-config";
import { OriginalAppearanceExample } from './OriginalAppearanceExample';
import { publicModes, demoSources } from './public-modes';
import { ChatEntries } from './ChatEntries';
import { codexDraftLink, startupRequest } from './codex-start';
import { getLocale, text as t } from '../locale.ts';

export { publicModes } from './public-modes';
export function PublicModeChoices({ mode, choose }: { mode: SourceMode; choose: (mode: SourceMode) => void }) {
  return <div className="public-mode-choices" aria-label={t('モードのプレビュー', 'Mode preview')}>
    {(Object.keys(publicModes) as SourceMode[]).map(key => <button key={key} aria-pressed={key === mode} onClick={() => choose(key)}>
      <strong>{publicModes[key].title}</strong><span>{publicModes[key].label}</span>
    </button>)}
  </div>;
}
export function CodexStartLink({ release = siteConfig.macCodexRelease }: { release?: MacCodexRelease | null }) {
  return <a className="primary codex-start-link" href={codexDraftLink(startupRequest(release, getLocale()))}>
    {t('CodexでUnharnessを始める', 'Start Unharness in Codex')} <span aria-hidden="true">↗</span>
  </a>;
}
export function PublicEntry({ choose }: { choose: (page: "demo" | "install" | "connect") => void }) {
  return <main id="main" className="public-entry">
    <section className="entry-intro"><p className="eyebrow">{t('まずは、Apple Silicon MacのCodex Desktopから。', 'YOUR AI. YOUR LOADOUT.')}</p>
      <h1>{t('モデルは変わった。', 'New model.')}<br/><span>{t('装備は、そのまま？', 'Same old harness?')}</span></h1>
      <p className="entry-promise"><span>{t('書き直す前に、', 'Before rewriting it,')}</span><span>{t('一度外して使ってみる。', 'try taking it off.')}</span></p>
      <p className="entry-lead">{t('いつもの構成を保存して、選んだ追加指示を外したり、自作・外部Skillの自動使用を抑えたり。ふだんの仕事で試して、必要なら戻せます。', 'Keep your usual setup. Try a lighter set of instructions and Skills. Let your everyday work show you what fits.')}</p>
      <nav className="entry-choices" aria-label={t('Unharnessの入口', 'Start using Unharness')}>
        <CodexStartLink/>
        <button className="secondary" onClick={() => choose('demo')}>{t('設定を変えずにデモを試す', 'Try the sample demo')}</button>
      </nav>
      <p className="codex-start-hint">{t('Codexの入力欄に依頼文を渡します。内容を確認して送信すると、AIが導入状況から案内します。', 'Opens a draft in Codex. Review and send it, then let your AI guide you from your current setup.')}</p>
      <button className="entry-returning" onClick={() => choose('install')}>{t('開かない場合・導入方法を見る', 'Copy the request or read the installation guide')}</button>
      <button className="entry-returning" onClick={() => choose('connect')}>{t("導入済みの方：接続して開く ", "Already installed? Connect to your Mac ")} <span aria-hidden="true">↗</span></button>
      <p className="entry-boundary">{t('無料・アカウント不要。設定と作品は手元のPCに。', 'Free & open source. Settings and artwork stay on your computer.')}<br/>{t('切り替えた構成は、新しいタスクで使います。', 'Use a prepared loadout in a fresh task.')}</p>
    </section>
    <section className="entry-art" aria-label={t('標準外観のプレビュー', 'Original appearance preview')}><Hangar condition="baseline" effects={false} locale={getLocale()}/><p className="scene-caption">{t('いつもの装備を残して、次の構成を試そう。', 'Keep your everyday setup. Try your next loadout.')}</p></section>
    <ChatEntries/>
    <OriginalAppearanceExample onInstall={() => choose('install')}/>
    <section className="entry-availability" aria-labelledby="entry-availability-title">
      <p className="eyebrow">{t('自分のAIで、はじめる。', 'START WITH YOUR OWN AI')}</p><h2 id="entry-availability-title">{t('Mac版Codexから。次はWindowsへ。', 'Mac Codex first. Windows next.')}</h2>
      <PlatformRoadmap/>
      <p>{t('初回はCodexに導入を頼み、いつもの構成を保存します。公開画面への接続は、自分のMacで許可して使います。', 'Ask Codex to help you install it and save your usual setup. Approve the public-page connection on your Mac.')}</p>
      <button className="secondary" onClick={() => choose('install')}>{t('Codexへの導入方法を見る', 'Read the installation guide')}</button>
      <SourceScope/>
    </section>
  </main>;
}
function PlatformRoadmap() {
  return <ol className="platform-roadmap" aria-label={t('対応状況と開発予定', 'Availability and roadmap')}>
    <li><span>{t('現在', 'Available now')}</span><strong>{t('Mac版Codex', 'Codex on Mac')}</strong><small>{t('Apple Silicon向けプレビュー', 'Apple Silicon preview')}</small></li>
    <li><span>{t('次に取り組む予定', 'Next')}</span><strong>{t('Windows版Codex', 'Codex on Windows')}</strong><small>{t('現在は配布対象外', 'Not available yet')}</small></li>
    <li><span>{t('その後の対応目標', 'Afterward')}</span><strong>Claude Code</strong><small>{t('macOS・Windowsを目標に', 'Planned for macOS and Windows')}</small></li>
  </ol>;
}
function SourceScope() {
  return <details className="source-scope"><summary>{t('変更するもの・保持するもの', 'What changes and what stays')}</summary>
    <dl><dt>{t('変更するもの', 'What changes')}</dt><dd>{t('自分で確認・選択した任意の追加指示と、通常の自作・外部Skill。Skillは無効・手動・自動を使い分けます。', 'Optional instructions and ordinary authored or third-party Skills you review and select. Skills can be disabled, explicit-only or automatic.')}</dd>
      <dt>{t('保持するもの', 'What stays')}</dt><dd>{t('公式プラグイン、メモリ、作業の継続、プロジェクトの必須要件、実行権限、Unharnessの操作・復旧機能。', 'Official plugins, memory, task continuity, project requirements, execution permissions, and Unharness controls and recovery.')}</dd></dl>
    <p>{t('初回Mac版では公式プラグインを元の状態で保持します。保存した構成へ戻す際は、独立して加えられた変更がないか確認します。', 'This Mac release retains official plugins at their saved Normal state. Recovery checks for independent edits before restoring a saved loadout.')}</p>
    <p>{t('軽い構成が、いつもよいとは限りません。外観はモードの演出で、性能向上を表すものではありません。普段使うAIの契約・使用量は別です。', 'A lighter loadout is a comparison condition, with no promised performance gain. Appearance is independent of performance. Your chosen AI subscription and usage are separate.')}</p>
  </details>;
}
function SampleModeDemo() {
  const [mode, choose] = useState<SourceMode>("normal"), selected = publicModes[mode], sample = demoSources[mode];
  return <main id="main" className="public-demo public-two-column"><section>
    <p className="eyebrow">{t('導入前のデモ ／ サンプル', 'BEFORE INSTALLING / SAMPLE')}</p><h1>{selected.title}</h1><p className="scene-subtitle">{selected.label}</p>
    <p className="entry-lead">{selected.description}</p>
    <PublicModeChoices mode={mode} choose={choose}/><Hangar condition={selected.scene} effects={false} locale={getLocale()}/>
  </section><aside className="public-panel"><p className="eyebrow">{t('このデモの架空の構成', 'SAMPLE SETTINGS')}</p><h2>{t('組み合わせを変えてみる。', 'Try a different combination.')}</h2>
    <dl className="demo-sources"><dt>{t('グローバルAGENTS.mdの例', 'Example global AGENTS.md')}</dt><dd>{sample.instructions}</dd>
      <dt>{t('リポジトリのAGENTS.md', 'Repository AGENTS.md')}</dt><dd>{t('保持する', 'Retained')}</dd>
      <dt>{t('公式プラグイン（例）', 'Official plugins (example)')}</dt><dd>{t('元の状態で保持する', 'Saved Normal state')}</dd>
      <dt>{t('自作の手順Skill（例）', 'Your authored Skill (example)')}</dt><dd>{sample.authoredSkill}</dd>
      <dt>{t('使用頻度の低い外部Skill（例）', 'Less-used third-party Skill (example)')}</dt><dd>{sample.externalSkill}</dd>
      <dt>{t('メモリ・作業の継続・実行権限', 'Memory, continuity and permissions')}</dt><dd>{t('保持する', 'Retained')}</dd></dl>
    <p className="boundary">{t('このデモは架空のデータです。モードを選んでも、あなたのAI設定は変わりません。', 'This demo uses synthetic data. Selecting a mode does not change your AI settings.')}</p>
    <p className="boundary">{t('実際の切替対象はローカルで確認した追加指示と自作・外部Skillです。現行Codexでは公式プラグインの個別OFFが反映されないため、このMac版では保持します。', 'Real changes are limited to reviewed optional instructions and ordinary Skills. This Mac release retains official plugins because individual OFF is unavailable in the qualified Codex version.')}</p>
    <p className="boundary">{t('ここでは設定例と外観の変化を体験できます。実際に使うときは、新しいタスクでふだんの依頼を試し、自分に合うか確かめます。', 'Explore sample settings and appearance here. For real comparisons, try your everyday work in a fresh task and decide what fits.')}</p>
  </aside></main>;
}
function PublishedInstall({ release }: { release: MacCodexRelease }) {
  const request = startupRequest(release, getLocale());
  return <div className="install-release">
    <h2>{t('Codexに導入を頼む', 'Ask Codex to help you start')}</h2>
    <p>{t("バージョン ", "Version ")} {release.version} ／ {t('Apple SiliconのMac向けです。Intel Macは未対応です。', 'For Apple Silicon Macs. Intel Macs are not supported.')}</p>
    <p>{t('Codexの入力欄で依頼文を確認して送信してください。未導入なら配布物と導入先を確認し、導入済みなら今の状態から案内します。', 'Review and send the draft in Codex. Your AI checks the release and target if you are new, or starts from your current installation.')}</p>
    <CodexStartLink release={release}/>
    <p className="codex-start-hint">{t('開かない場合は、下の依頼文をコピーしてCodexに貼り付けてください。', 'If Codex does not open, copy the request below and paste it into Codex.')}</p>
    <CopyRequest text={request} label={t('Codexへの導入依頼', 'Startup request for Codex')} button={t('導入依頼をコピー', 'Copy startup request')} />
    <details className="install-release-details"><summary>{t('自分でダウンロード・配布物を確認', 'Download and verify the release yourself')}</summary>
      <p>{t('展開したフォルダをCodexへ渡し、「はじめに.md」の依頼文を使うこともできます。', 'You can also give Codex the extracted folder and use the request in はじめに.md.')}</p>
      <a className="secondary install-download" href={release.archiveUrl} referrerPolicy="no-referrer">{t('Mac版ZIPをダウンロード', 'Download the Mac ZIP')}</a>
      <p><a href={release.sourceUrl} target="_blank" rel="noopener noreferrer">{t('ソースとライセンスを確認', 'View source and license')}</a></p>
      <p>{t('ZIPの照合値（SHA-256）', 'ZIP checksum (SHA-256)')}<code>{release.archiveSha256}</code></p>
    </details>
  </div>;
}
export function PublicInstall({ release = siteConfig.macCodexRelease }: { release?: MacCodexRelease | null }) {
  const [application, setApplication] = useState("codex"), [os, setOs] = useState("mac");
  const target = os === "mac" && application === "codex";
  return <main id="main" className="public-install"><p className="eyebrow">{t('導入の準備', 'GET STARTED')}</p><h1>{t('ふだんのAIから、開く。', 'Open it with your everyday AI.')}</h1>
    <p className="entry-lead">{t('まずはMac版Codexから。Windows版Codexに続き、Claude Codeへの対応を目指します。', 'Start with Codex on Mac. Codex on Windows comes next, followed by Claude Code.')}</p>
    <div className="install-selectors"><label>{t('使うAI', 'Your AI')}<select aria-label={t('使うAI', 'Your AI')} value={application} onChange={e => setApplication(e.target.value)}><option value="codex">Codex Desktop</option><option value="claude">Claude Code</option></select></label>
      <label>{t('使うOS', 'Your OS')}<select aria-label={t('使うOS', 'Your OS')} value={os} onChange={e => setOs(e.target.value)}><option value="mac">macOS</option><option value="windows">Windows</option></select></label></div>
    <section className="public-panel">{target && release ? <PublishedInstall release={release}/> : <>
      <h2>{target ? t('Mac版の公開配布を準備しています', 'The Mac release is being prepared') : t('この組み合わせは後続の対応です', 'This combination is planned for later')}</h2>
      <p>{target ? t('ローカルの実行環境・画面・管理Skillをまとめた配布物を検証中です。公開ダウンロードはまだ開始していません。', 'The bundle of local runtime, interface and Skills is being verified. A public download is not available yet.')
        : application === 'codex' ? t('Windows版Codexは、Mac版に続いて次に取り組む予定です。現在の配布はApple SiliconのMac向けです。', 'Codex on Windows is next. The current download is for Apple Silicon Macs.')
        : t('Claude CodeはWindows版Codexの後に取り組む予定です。macOS・Windowsの両方への対応を目指しています。現在の配布対象には含まれません。', 'Claude Code for macOS and Windows is planned after Codex on Windows. It is not included in the current release.')}</p></>}
      {target && <ol><li>{t('導入後、Codexに「アンハーネスを開いて」と頼みます。', 'After installation, ask Codex to open Unharness.')}</li><li>{t('ローカル画面で対象を確認し、今の構成をNormalに保存します。', 'Review the local targets and save your current setup as Normal.')}</li><li>{t('解除対象を確認した後、新しいタスクで2つの構成をAIと相談します。', 'After choosing the optional sources, discuss both release modes with your AI in a fresh task.')}</li></ol>}
      <p className="boundary">{t('Unharnessの利用に、有料APIや設定を預ける運用サーバーは必要ありません。普段使うAIの契約・使用量は別です。', 'Unharness needs no paid API or hosted configuration service. Your chosen AI subscription and usage are separate.')}</p>
      <SourceScope/>
    </section>
  </main>;
}
export function ConnectionInstructions() {
  return <div className="connection-instructions"><h2>{t('導入済みなら、ローカルから許可する。', 'Already installed? Approve the connection locally.')}</h2>
    <ol><li>{t('Codexに依頼して、Unharnessのローカル画面を開きます。', 'Ask Codex to open the local Unharness workbench.')}</li><li>{t('接続先のサイト・対象・許可する操作を確認します。', 'Review the site, target and allowed operations.')}</li><li>{t('許可後の一時リンクで、この画面を開きます。', 'Use the temporary link issued after your approval.')}</li></ol>
    <CopyRequest text={t('アンハーネスのローカル画面を開いて、公開画面への接続許可を確認したいです。Unharnessのstatusで接続先を確認し、open_workbench、request_public_connectionの順でローカルの許可画面を開いてください。まだ許可やモード変更は行わないでください。', 'Open the local Unharness workbench so I can review permission to connect the public page. Check the target with status, then use open_workbench and request_public_connection to open the local approval screen. Do not approve the connection or change modes yet. Please guide me in English.')} />
  </div>;
}

export function PublicDemo() {
  const [sample, setSample] = useState<'guide' | 'modes'>('guide');
  return <div className="public-demo-container">
    <div className="public-demo-tabs" role="group" aria-label={t('デモの種類', 'Demo type')}>
      <button type="button" aria-pressed={sample === 'guide'} onClick={() => setSample('guide')}>{t('AIと進めるデモ', 'AI-guided demo')}</button>
      <button type="button" aria-pressed={sample === 'modes'} onClick={() => setSample('modes')}>{t('設定のデモ', 'Settings demo')}</button>
    </div>
    {sample === 'guide' ? <main id="main"><GuidedExperience embedded language={getLocale()}/></main> : <SampleModeDemo/>}
  </div>;
}
