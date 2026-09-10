import { useState } from "react";
import { Hangar } from "../Hangar";
import { CopyRequest } from "./CopyRequest";
import type { SourceMode } from "../sources";
import { siteConfig, type MacCodexRelease } from "../site-config";

export const publicModes = {
  normal: { title: "Normal", label: "通常装備", scene: "baseline", description: "保存しておいた、いつもの構成へ。" },
  unseal: { title: "UNSEAL", label: "限定解除", scene: "manual-only", description: "零式に、選んだ追加Skillを重ねる。" },
  trueform: { title: "TRUEFORM", label: "零式", scene: "fixed-only", description: "選んだ公式プラグインのSkillを軸に。" },
} as const;
export function PublicModeChoices({ mode, choose }: { mode: SourceMode; choose: (mode: SourceMode) => void }) {
  return <div className="public-mode-choices" aria-label="モードのプレビュー">
    {(Object.keys(publicModes) as SourceMode[]).map(key => <button key={key} aria-pressed={key === mode} onClick={() => choose(key)}>
      <strong>{publicModes[key].title}</strong><span>{publicModes[key].label}</span>
    </button>)}
  </div>;
}
export function PublicEntry({ choose }: { choose: (page: "demo" | "install" | "connect") => void }) {
  return <main id="main" className="public-entry">
    <section className="entry-intro"><p className="eyebrow">AIの装備を、見直そう。</p>
      <h1>外す。<br/>比べる。<br/><span>自分に合う形へ。</span></h1>
      <p className="entry-lead">追加指示とSkillの組み合わせを変え、<br className="wide-only"/>いまのAIと仕事に合う構成を見つける。</p>
      <p className="entry-boundary">無料・アカウント不要。設定と作品は手元のPCに保存します。</p>
    </section>
    <section className="entry-art" aria-label="標準外観のプレビュー"><Hangar condition="baseline" effects={false}/><p className="scene-caption">見た目は自由に。性能は、実際の仕事で比べる。</p></section>
    <nav className="entry-choices" aria-label="Unharnessの入口">
      <button onClick={() => choose("demo")}><span>01 ／ デモ</span><strong>試してみる</strong><small>架空の設定で、3つのモードを体験。</small></button>
      <button onClick={() => choose("install")}><span>02 ／ 導入</span><strong>自分のAIに導入する</strong><small>{siteConfig.macCodexRelease ? "MacのCodexへ。導入をAIに頼めます。" : "MacのCodexから。配布の準備状況を確認。"}</small></button>
      <button onClick={() => choose("connect")}><span>03 ／ 導入済み</span><strong>接続して開く</strong><small>ローカルで許可して、登録済みの設定へ。</small></button>
    </nav>
    <p className="entry-note">軽い構成が、いつもよいとは限りません。ふだんの構成をNormalに保存して、戻せる状態で比べます。</p>
  </main>;
}
export function PublicDemo() {
  const [mode, choose] = useState<SourceMode>("normal"), selected = publicModes[mode];
  return <main id="main" className="public-demo public-two-column"><section>
    <p className="eyebrow">導入前のデモ <span>／ サンプル</span></p><h1>{selected.title}</h1><p className="scene-subtitle">{selected.label}</p>
    <p className="entry-lead">{selected.description}</p>
    <PublicModeChoices mode={mode} choose={choose}/><Hangar condition={selected.scene} effects={false}/>
  </section><aside className="public-panel"><p className="eyebrow">このデモの架空の構成</p><h2>組み合わせを変えてみる。</h2>
    <dl className="demo-sources"><dt>追加した指示</dt><dd>{mode === "normal" ? "保存した指示を使う" : mode === "unseal" ? "最小ガイドを使う" : "選んだ追加指示を外す"}</dd>
      <dt>確認済み公式プラグインのSkill（例）</dt><dd>選んだ対象を自動で使う</dd>
      <dt>自作の手順Skill（例）</dt><dd>{mode === "trueform" ? "必要なときに明示して使う" : "追加で自動使用する"}</dd>
      <dt>メモリ・作業の継続・実行権限</dt><dd>保持する</dd></dl>
    <p className="boundary">このデモは架空のデータです。モードを選んでも、あなたのAI設定は変わりません。</p>
    <p className="boundary">実際に管理する対象は、ローカル画面で確認して登録します。零式の任意の自動Skillを空にすることもできます。</p>
    <p className="boundary">速さや品質は、別の比較記録から判断します。</p>
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
    <p className="entry-lead">最初の公開版は、MacのCodex Desktopを対象にしています。</p>
    <div className="install-selectors"><label>使うAI<select aria-label="使うAI" value={application} onChange={e => setApplication(e.target.value)}><option value="codex">Codex Desktop</option><option value="claude">Claude Code</option></select></label>
      <label>使うOS<select aria-label="使うOS" value={os} onChange={e => setOs(e.target.value)}><option value="mac">macOS</option><option value="windows">Windows</option></select></label></div>
    <section className="public-panel">{target && release ? <PublishedInstall release={release}/> : <>
      <h2>{target ? "Mac版の公開配布を準備しています" : "この組み合わせは後続の対応です"}</h2>
      <p>{target ? "ローカルの実行環境・画面・管理Skillをまとめた配布物を検証中です。公開ダウンロードはまだ開始していません。"
        : "初回のMac Codex版を完成させた後に対応します。現在の配布対象としては案内していません。"}</p></>}
      {target && <ol><li>導入後、Codexに「アンハーネスを開いて」と頼みます。</li><li>ローカル画面で対象を確認し、今の構成をNormalに保存します。</li><li>解除対象を確認した後、新しいタスクで2つの構成をAIと相談します。</li></ol>}
      <p className="boundary">Unharnessの利用に、有料APIや設定を預ける運用サーバーは必要ありません。普段使うAIの契約・使用量は別です。</p>
    </section>
  </main>;
}
export function ConnectionInstructions() {
  return <div className="connection-instructions"><h2>導入済みなら、ローカルから許可する。</h2>
    <ol><li>Codexに依頼して、Unharnessのローカル画面を開きます。</li><li>接続先のサイト・対象・許可する操作を確認します。</li><li>許可後の一時リンクで、この画面を開きます。</li></ol>
    <CopyRequest text="アンハーネスのローカル画面を開いて、公開画面への接続許可を確認したいです。Unharnessのstatusで接続先を確認し、open_workbench、request_public_connectionの順でローカルの許可画面を開いてください。まだ許可やモード変更は行わないでください。" />
  </div>;
}
