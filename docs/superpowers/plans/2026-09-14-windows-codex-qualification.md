# Windows Codex implementation and qualification plan

> Windows側のCodex向け。`superpowers:executing-plans`が利用可能なら工程ごとに使う。
> 利用者はWindowsへの引き継ぎ準備を依頼した。新タスクの自動作成は行わず、
> この計画を受け取ったタスクで実環境を再確認して進める。

**Goal:** WindowsネイティブのCodex Desktopで、保存・3モード・新規タスク確認・
お気に入り・外観・独立復旧の一周を、安全な実装と実機証拠で成立させる。

**Architecture:** OSのファイル所有・公開・復旧・プロセス起動と、Codex固有の
読み込み・登録・観測を分ける。共通のモードや保存契約は複製せず、既存アダプターを
使う。Windowsの未観測動作をMacから推定して実装済みにしない。

**Tech Stack:** Native Windows、PowerShell、Node.js 24+、既存の固定npm依存、
Codex Desktop/native CLI、React/Vite/PixiJS、ローカルMCPと公開v2接続。

**Spec:** [製品仕様](../../spec.md)、[現行モード契約](../../spec-mode-inheritance.md)、
[ユーザーソース契約](../../spec-user-sources.md)、[配布契約](../../spec-plugin-distribution.md)。

## 固定条件

- 個人の設定・ACL・権限を、検証を通すために緩めない。最初は合成環境だけで実施。
- 公式プラグインはNormalで保持。追加指示・通常Skill・管理接続を区別する。
- Normalと旧v1/v2/v3、お気に入り、作品は不変の保存版として保つ。
- `prepared / recorded inputs / unknown runtime`を分ける。READYは合格証拠ではない。
- WindowsとWSL、CLIとDesktop、fixtureと個人設定を混ぜない。
- 合成テストのOS偽装、Darwin guardの削除だけ、失敗するtestの一括skipで先に進まない。
- 新しい永続schemaが必要ならbefore/after・移行・rollback・旧readerの拒否を先に示す。
- 手元で十分な検証のためにGitHub Actionsを新設しない。公開・リリースは別の承認。

## 現在の差分地図

以下は`6ddaec6`の静的確認。着手時にコードを再読し、増減を記録する。

| 領域 | 現在の実装と主な入口 | Windowsで必要な証拠・作業 |
| --- | --- | --- |
| 診断・fixture | `src/codex/`、`src/core/`、`src/loadouts/` | 旧Windows結果がある。現行ソースで再実行し、未解決のbaseline読込を確認 |
| 実ソースの公開・復旧 | `src/sources/transaction.mjs`の`transact`/`recoverTransaction`はDarwin限定 | Windows metadata・原子的公開・ロック・中断復旧を先に実装検証 |
| 保持設定・登録追加 | `src/sources/retained-settings.mjs`、`directory-rebind.mjs`、`src/setup/enrollment.mjs`、`plugin-enrollment.mjs`にOS gate | Normalの版保持、登録拡張、導入元変更の再確認を同じWindows境界へ統合 |
| 所有と保存先 | `src/sources/platform.mjs`、`src/platform/directory-identity.mjs`、`src/setup/connection-records.mjs` | WindowsでPOSIX mode/uidの判定を省く箇所がある。ACLや永続的な実体識別を確認できた証拠ではない |
| 配布・MCP起動 | `src/setup/distribution.mjs`の`NODE_RUNTIME`、`scripts/build-plugin.mjs`はdarwin-arm64固定。`packaging/unharness/mcp.json`は`./scripts/unharness`を起動 | Windows Node/runtime・完全性索引・ネイティブ起動・実際の`${PLUGIN_ROOT}`/`${PLUGIN_DATA}`展開を確認 |
| 独立復旧 | `src/setup/plugin-recovery.mjs`の`.command`・POSIX bootstrap、`recovery-cli.mjs`のDarwin gateと`/usr/bin/open` | キャッシュ外に残るWindows版の検証済み復旧経路。旧Mac復旧版は変更しない |
| 起動・再実行 | `src/gui/launch*.mjs`、`src/codex/replay-desktop.mjs` | プロセス終了・再接続・Windowsアプリでの作業場所起動。現在の再実行起動はMac限定 |
| 版・公開入口 | `src/setup/product-version.mjs`、`releases.mjs`、`site/public/releases/macos-arm64.json`、`web/src/entry/codex-start.ts`、`PublicEntry.tsx` | 現在はMacの識別・配布URL・「このMac」の依頼文。WindowsにMac版を勧めず、実在するWindows成果物の確認後に追加 |

## W0 — 実環境と作業場所を確定する

- [ ] Windows側のcheckoutで`AGENTS.md`と[引き継ぎ](../../handoff-windows-codex.md)を読む。
- [ ] Gitの差分と分岐を確認し、無関係な変更を保持する。cleanなら最新mainをfast-forward。
  dirty/divergedならそのcheckoutをresetせず、必要に応じて隔離worktreeを作る。
- [ ] 次の読み取りを行い、実際の実行ファイルとDesktop版を確定する。

```powershell
git status --short --branch
git remote -v
git rev-parse HEAD
$PSVersionTable.PSVersion
[Environment]::OSVersion.VersionString
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture
Get-Command node.exe, npm.cmd, codex.exe -ErrorAction SilentlyContinue |
  Select-Object Name, Source
Get-AppxPackage '*Codex*' | Select-Object Name, Version, Architecture, InstallLocation
Get-AppxPackage '*ChatGPT*' | Select-Object Name, Version, Architecture, InstallLocation
```

複数候補、CLIのみ、別版のDesktopが見つかったら、実際にこの検証で使うものを
対応付ける。Appx名やPATHだけでDesktopの内蔵ランタイムと同一と判断しない。
Codexのworkspace dependency取得ツールがあれば、Node 24+の候補取得に使える。
`codex.cmd`/`.bat`をネイティブCodexとして診断へ渡さない。npmの`.cmd`は別の入口。

- [ ] 選んだNodeが`process.platform === 'win32'`で、major 24以上と確認する。
  OS/CPU、NTFS等のfilesystem、同期フォルダーの有無、現在のsandbox/管理者状態を記録。
  最初のfixtureは新しく作るローカル領域で行い、日本語・空白のあるパスも後で確認。
- [ ] 使用中のNative Windows環境を維持する。公式の[Windows sandbox説明](https://learn.chatgpt.com/docs/windows/windows-sandbox)
  も確認するが、これを理由にsandbox方式や権限を自動変更しない。WSLは別の結果。

**終了条件:** Native Windowsの対象と検証SHAが分かる。Mac用ZIPは使わない。
WindowsでなければW1以降のWindows結果を出さず、環境の不足を返す。

## W1 — 現行の基礎を再検証する

以下の`$nodeExe`と`$codexExe`にはW0で確認した実ファイルの絶対パスを設定する。
`$evidenceDir`はこのcheckoutの`local-evidence`配下に新しく作る。
過去のPCのパスをコピーしない。下のPATH解決は、W0でその候補が使用対象と確認できた場合の例。
PATHにない場合は、最初の2変数へW0で確認した実パスを代入してから続ける。
PowerShell外部コマンドの非0終了を見落とさない。

```powershell
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
# codex.exeが複数版ある場合は、Desktopとの対応を確認したパスを選ぶ。
$codexExe = (Get-Command codex.exe -ErrorAction Stop).Source
$nodeInfoJson = & $nodeExe -p 'JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,executable:process.execPath})'
if ($LASTEXITCODE -ne 0) { throw 'Node inventory failed' }
$nodeInfo = $nodeInfoJson | ConvertFrom-Json
if ($nodeInfo.platform -ne 'win32' -or [int]($nodeInfo.node.TrimStart('v').Split('.')[0]) -lt 24) {
  throw 'Native Windows Node.js 24+ is required'
}
$nodeInfo
& $codexExe --version
if ($LASTEXITCODE -ne 0) { throw 'Codex version check failed' }
$runName = 'windows-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$evidenceDir = Join-Path (Join-Path (Get-Location).Path 'local-evidence') $runName
New-Item -ItemType Directory -Path $evidenceDir -ErrorAction Stop | Out-Null
npm.cmd ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Locked dependency installation failed' }
& $nodeExe --test --test-reporter=spec *> (Join-Path $evidenceDir 'tests.log')
$testExit = $LASTEXITCODE
Get-Content (Join-Path $evidenceDir 'tests.log') -Tail 25
Write-Output ('Test exit code: ' + $testExit)
```

終了コード・全件数・失敗・skipを記録する。現状のMac限定領域による拒否と、
汎用コードの退行を分ける。全体が失敗しても、安全な読み取り診断まで一律に中止しない。
Nodeとnpm scriptが別ランタイムを使っていないか確認する。Remotion用の依存導入や
`media/x-intro`の動画再生成は不要。

```powershell
& $nodeExe .\bin\unharness.mjs inspect --cwd . --codex $codexExe --output (Join-Path $evidenceDir 'inventory.json')
if ($LASTEXITCODE -ne 0) { throw 'Inspect failed; review its sanitized report' }
& $nodeExe .\bin\unharness.mjs probe-controls --codex $codexExe --output (Join-Path $evidenceDir 'controls.json')
if ($LASTEXITCODE -ne 0) { throw 'Fixture control check failed; review cases and cleanup' }
```

`probe-controls`には`--cwd`を付けない。新規の一時fixtureだけを使い、個人設定は変更しない。
JSONはCLIの`--output`から直接保存し、PowerShellの文字コード変換で本文やハッシュを変えない。
主な回帰入口は`test/probe-cli.test.mjs`、`source-controls.test.mjs`、`rpc-client.test.mjs`、
`desktop-fixture.test.mjs`、`local-store.test.mjs`、`loadouts.test.mjs`。

- [ ] `npm.cmd run check`、`npm.cmd run build`、`npm.cmd run build:site`を実行し、各終了を確認。
- [ ] 既存のWindows startup allowanceとcleanup検証を保持。無差別なtimeout延長や
  `taskkill /IM node.exe`で回避しない。終了させるのは所有確認できた子プロセスだけ。

**終了条件:** 現行SHAの基礎結果と残る失敗一覧がある。古い148件の成功で代用しない。

## W2 — fixtureの新規Desktopタスクを合わせる

読む: [過去のWindows未一致](../../evidence/2026-09-07-windows-fresh-task.md)、
[Desktop観測手順](../../desktop-observation.md)、[loadout関連付け](../../loadouts.md)。

- [ ] `& $nodeExe .\bin\unharness.mjs gui --demo`で新規の合成fixture/storeを開く。
  表示されたURLとresume情報を今回の私的な記録へ残す。昔のポートやfixtureを復用しない。
- [ ] baselineの保存・選択・確認・適用を行い、現在のapplication receiptを保持。
- [ ] 返されたprojectそのものを新しいローカルDesktopタスクで開く。
  アプリ操作が必要なら、本人へ正確なフォルダーとその操作だけを案内する。
  toolが拒否したUI操作を別経路で回避しない。新タスク作成ツールの明示許可要件も守る。
- [ ] 返されたplain promptで最初の応答を終える。markerやこのrunbookをtrialへ貼らない。
- [ ] そのタスクの記録と、現在のfixture/applicationを照合して保存する。
  `--current`は実際のtrial側で使う。control taskから読む場合は、本人が選んだ正確な
  sessionファイルを`--session`で指定し、他の会話を広く探さない。
- [ ] baselineが合った後、manual-only・明示Skill呼び出し・fixed-only・baseline復帰を
  同じ作成経路・モデル・推論・権限で1タスクずつ確認する。
- [ ] GUIの再接続、effects-off、狭い画面、独立編集の競合停止も確認する。

未一致なら結果を保持し、ディスク内容・初期入力・作成経路・refresh/再起動を分けて調べる。
自動再起動はしない。fixtureのfixed-onlyを製品TRUEFORMと呼ばない。
診断のfull-runtimeフラグは仕様上falseのままなので、合格のために書き換えない。

**終了条件:** 新規baselineの一致と残りのfixture sequenceが記録されている。
baselineが未一致でも独立したW3の合成実装研究は進められるが、製品のDesktop合格には進めない。

## W3 — Windowsの保存・変更・復旧境界を実装する

読む: [ソース契約](../../spec-user-sources.md)、[保持設定](../../spec-retained-settings.md)、
[アーキテクチャ](../../architecture.md)。上の差分地図に挙げた各OS gateの関数が入口。

- [ ] Windows上で失敗する最小の合成例を先に作る。現行のunsupported-platformを記録。
- [ ] ローカルファイルと私的な保存領域について、owner SID/DACL・継承・読取専用属性・
  再解析点/junction/symlink・hard link・同一実体の識別を確認する。
  `uid=0`や`chmod(0600)`相当だけで私的な所有・ACL保持を証明しない。
- [ ] 空白/日本語、drive letter大小文字、短名/長名、CRLF、BOM、同一volumeの公開、
  オープン中ファイルの置換、rename失敗、PID再利用、電源再起動後の識別を合成例で確認。
  UNC・同期フォルダー等を未対応にする場合は明示的に拒否・表示する。
- [ ] 同じ責務のOS判定を散在させず、既存platform責務へまとめる。
  対応を確認できたmetadataだけを書き戻す。未知の属性・外部編集は保持して停止。
- [ ] transaction、retained-settings、enrollment、directory-rebindを同じ境界で扱う。
  journal作成、stage、各write、state公開で中断し、再起動後の回復・重複要求・競合拒否を確認。
- [ ] OS gateを開く変更と、その根拠になるWindowsテストを同じscoped変更にする。
  テスト用platform偽装を製品の制御経路に入れない。

主な回帰: `test/source-directory-identity.test.mjs`、`source-platform-defaults.test.mjs`、
`retained-settings.test.mjs`、`source-directory-rebind.test.mjs`、`source-enrollment.test.mjs`、
`recovery-entrypoints.test.mjs`、`setup-source-state-v3.test.mjs`。Windows固有のケースも追加する。

**終了条件:** 新規の合成プロファイルでNormal・3モード・保持設定・登録追加・復旧が成立。
元の設定と無関係な項目は変わらず、旧保存版は読める。個人の実設定はまだ操作しない。

## W4 — Windows配布・ネイティブMCP・キャッシュ外の復旧

読む: [配布仕様](../../spec-plugin-distribution.md)、[Mac組立の責務](../../plugin-package.md)、
[独立復旧](../../plugin-recovery.md)、[更新時の照合](../../plugin-update.md)。

- [ ] 実機のCPUに対応するWindows用Nodeを、公式の配布物と照合値で選ぶ。
  Macのtar.gz・署名・ハッシュを転用しない。利用者にnpmや追加の有料APIを必須にしない。
- [ ] 起動・distribution検証・自己識別・固定更新catalogをWindowsに対応させる。
  現行Mac配布物とmetadataを不変のまま保ち、旧版readerの互換性を確認する。
- [ ] 個人の導入登録と分離した新規Codexプロファイルで、native CLIの実際の
  `plugin --help` / `plugin marketplace --help`と導入結果を確認する。
  名前の一致だけで既存marketplaceの所有を認定しない。
- [ ] 完全なWindows成果物を標準のZIP展開で検証し、内蔵NodeだけでMCPを起動する。
  ダウンロード由来のMark-of-the-WebやSmartScreenの扱いも記録する。動作させるために
  保護を一括解除したり、未承認の`Unblock-File`・実行ポリシー変更を行わない。
  `${PLUGIN_ROOT}`/`${PLUGIN_DATA}`の実際の展開、cwdと対象profileの区別、tools一覧を確認。
- [ ] 原本のNormalを保った更新・再導入・取消・競合を検証する。
  導入元の変更がretained-onlyなら、具体的な差分を確認して既存のreview/acceptで新しい版にする。
- [ ] 旧cache削除・MCP停止・native data不在でも、cache外の検証済みruntimeと操作手順から
  Normalへ戻せることを確認する。更新を実行する側も古いcacheへ依存させない。
- [ ] Windowsアプリの起動/リプレイ引き渡し、URL schemeの登録と未送信draftを実機確認。
  CLI `app`がその版で同じ意味か確認し、インストーラー起動を成功としない。

主な回帰: `test/distribution.test.mjs`、`plugin-binding.test.mjs`、`plugin-entrypoints.test.mjs`、
`plugin-recovery.test.mjs`、`gui-launch.test.mjs`、`product-startup.test.mjs`、
`codex-start-link.test.mjs`。Windows向けの構造・boot検証ケースを追加する。

**終了条件:** 公開前のWindows候補があり、完全性・新規導入・更新・独立復旧の証拠がある。
候補を作っただけでWindowsの公開リンクや対応表示を有効化しない。

## W5 — 製品としての一周をWindows Desktopで確認

- [ ] 配布した状態の管理Skillから開く。未導入/旧版/無効化/MCP不調を区別できる。
- [ ] まず登録対象を自分で作った合成profileで検証。個人profileへ進む場合は、
  Windowsでの対象と変更案、独立復旧経路を具体化し、本人の明示承認を得る。
- [ ] Normal保存、v3の2構成保存と別操作のモード準備、新しいtaskの記録照合、
  お気に入り復帰、古い版保持を、画面とAIの両入口で確認する。
- [ ] 公開HTTPS→Windows loopbackのpairing・取消・expiry・再接続・lost replyを実機確認。
  実際のWindows内蔵browserの許可とWebMCPを確認し、通常Chromeの結果で代用しない。
  CORS、firewall、sandboxを一括無効化しない。browser未対応はそのまま未確認とする。
  Windows用の公開UIが未配信なら、まずローカルbuildと合成HTTPSの結果を保存する。
  実公開での確認だけ`not-run`に残し、必要な公開環境・変更内容を具体化して承認を得る。
  仮の公開先へ無断deployしたり、mock結果を本物の公開接続へ読み替えない。
- [ ] 日英切替で選択・入力・確認案が残る。Windowsへ渡す依頼文が「このMac」にならず、
  実在しないWindows ZIPやMac版更新を案内しない。ネット不通・更新延期でも使える。
- [ ] 白銀・琥珀・自分の作品の選択/保存/再選択、画像カード保存、effect-off/reduced motion、
  ローカルの履歴・明示した再実行を確認。見た目の選択は設定を変えない。
- [ ] 最後は選んだNormalへ戻し、未完了操作がないことと保持した設定・記録を照合する。

**終了条件:** Windows版で表明する機能の一周が、実際のDesktopの証拠に結び付いている。
不一致・不明は不明として残す。単なるMCP自己申告やREADYで合格にしない。

## W6 — 証拠とMacへの差分レビューを閉じる

- [ ] `docs/evidence/YYYY-MM-DD-windows-codex-*.md`へ、実行SHA/環境、工程ごとの結果、
  修正・失敗・skip・未実行・復旧後の状態を匿名化して保存する。
- [ ] 影響したNode/GUI回帰と`npm run check`/両buildを実行する。
  `UNHARNESS_PLAYWRIGHT_MODULE`と`UNHARNESS_BROWSER_EXECUTABLE`を使う既存browserテストは、
  Windowsで実際に使えるパスを指定。未設定によるskipを画面の合格にしない。
- [ ] 共通処理や保存schemaを変更したら、Mac側へcommit SHAと必要な回帰を返す。
  Windowsでの成功をMac再検証として数えない。
- [ ] `compatibility.md`/`status.md`/README日英を、取得した証拠の範囲だけ更新。
  必要なMac回帰が残る場合は、既存Mac機能への退行を未確認と明記する。
- [ ] scoped commit/pushとremote同期を確認。Windows配布公開は、候補の版・hash・
  対応範囲を提示してから、その操作への承認に従う。

## 止める条件と、続けられる作業

| 観測 | 扱い |
| --- | --- |
| WSL、非Windows Node、別アプリのCLI | 対象を解決する。Windowsの合格は記録しない |
| 既存checkoutがdirty/diverged | 無関係な差分を保護。安全な読み取りや隔離作業は継続可 |
| `unsupported-platform`、ACL/実体を証明できない | 実設定変更は停止。合成例の調査・OS対応実装を続ける |
| baselineのカタログ不一致 | その段階の結果を保存。新規task/作成経路/refreshを分け、勝手に再起動しない |
| 旧ファイル・未知のjournal・他のprocess/登録 | 所有を確認。上書き・force-unlock・一括削除をしない |
| ツール/OSの承認レビューが拒否 | 拒否された操作と理由を報告。別のshellやWSLで迂回しない |
| 保存schema・配布契約の変更が必要 | before/after・移行とrollbackを具体化して先にレビュー |
| 実データへの適用、再起動、公開が必要 | 具体的な対象と操作だけ本人へ確認。無関係な安全な工程は続ける |

この計画とPowerShellの例はMac側で準備したもの。構文・リンク・既存CLIのhelpは
ここで確認できるが、Windowsコマンドの実行結果やWindows対応の証明ではない。
