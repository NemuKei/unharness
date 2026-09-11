# Mac向けの導入案内と配布ラッパー

Apple SiliconのMacで、展開した配布フォルダをCodexへ渡して導入を依頼する。利用者によるGit・npm・コマンドの手入力を前提にしない。2026-09-11に[0.0.1開発プレビュー](https://github.com/NemuKei/unharness/releases/tag/v0.0.1)を公開した。公式ディレクトリからの直接導入は案内していない。

## 利用者の入口

サイトまたは配布ページから対象版のZIPとSHA-256を取得し、展開したフォルダの`はじめに.md`にある依頼文をCodexへ渡す。依頼文とAIが行う具体的な手順の正本は[配布用の案内](../packaging/mac-release/はじめに.md)。初回の対象確認とNormal保存はローカル画面で行う。現在のタスクでMCPがまだ見えない場合は、新しいタスクで管理Skillを読み込む。

この経路は[合意した導入計画](superpowers/plans/2026-09-09-mac-product-experience.md)のAIへの導入依頼に対応する。公開サイトには実在・取得可能な配布物が確認できた時点で導入ボタンと版を設定する。公開前のZIPへ架空の公開リンクを付けない。

サイトの導入画面には、この依頼文のコピーと手動ダウンロードの導線がある。公開後の版を`web/src/site-config.ts`の`macCodexRelease`へ設定した場合だけ表示する。設定するのは版、ZIPのURLとSHA-256、配布内容の識別子、ソースとライセンスのURL。現在は公開した0.0.1を設定している。認証なしの実ダウンロードでZIP・照合ファイル・タグのソースを確認してから設定した。Intel Mac・Claude Code・Windowsを配布対象として案内しない。

## 配布担当者が組み立てるもの

まず[パッケージ作成](plugin-package.md)で、変更のないソースから`unharness`を組み立てる。その内容は変更せず、別の新しい出力ディレクトリへ次の構造でコピーする。

```text
unharness-<version>-macos-arm64/
  .agents/plugins/marketplace.json
  plugins/unharness/              # distribution.jsonを含む検証済みの全配布物
  はじめに.md
```

マーケットプレイスの正本は[marketplace.json](../packaging/mac-release/marketplace.json)。公開者用の名前`deltahelmlab-unharness`を使い、利用者の`personal`や他の登録を置き換えない。配布フォルダはローカルの導入元として記録されるため、勝手に一時フォルダ扱いで削除しない。既存の同名登録が違う場所を指していた場合は、その更新範囲を確認する。

アーカイブには上記3項目だけを含める。検証用Codexホーム、認証、ログ、Normal・作品・比較などの保存データは別ディレクトリに置く。Nodeを通常のGitファイルや静的サイトの小容量ファイル枠へ入れず、アーカイブを受け付ける承認済み配布先へ置く。ZIP化ではUnixの実行ビットを保持し、macOS標準の展開処理で全ファイルと実行ビットが一致することを確認する。

## 導入時に照合する内容

ダウンロードしたZIPは、選択した配布元のSHA-256と先に照合する。以下は、展開済みの`plugins/unharness`を明示した作業ディレクトリとして実行する、AI・配布担当者向けの内容照合例である。

```sh
runtime/bin/node --input-type=module -e 'import { readDistribution } from "./src/setup/distribution.mjs"; const { id, manifest } = await readDistribution(process.cwd()); console.log(JSON.stringify({ id, version: manifest.version, sourceRevision: manifest.sourceRevision, sourceDirty: manifest.sourceDirty }));'
```

表示された識別子と版を配布記録に照合する。内容索引は全ファイルの一致を確認するもので、配布元の真正性を証明する署名の代わりにはならない。

確認したCodex実行ファイルを使い、**選択したCodexホームを`CODEX_HOME`として指定した子プロセス**で、マーケットプレイスの追加とプラグインの追加を行う。環境変数やプラグインの作業場所だけから利用者の対象を確定しない。導入前後の設定を比較し、他の登録・メモリ・権限などを保持する。その後は同梱の管理Skillに従ってローカル接続を設定し、[独立した復旧コピー](plugin-recovery.md)を確認する。

## 確認できた範囲

[2026-09-11の配布候補検証](evidence/2026-09-11-final-native-candidate.md)では、この構造からの実際のCodex導入、同梱Nodeだけでの設定、Native MCP、アプリ内ブラウザーでの保存と復旧、ZIP展開後の一致を確認した。[公開後のMac QA](evidence/2026-09-11-public-mac-qa.md)では、公開ZIPからの実導入、本物の公開HTTPSとの接続、CodexのWebMCP呼び出し、画像カードのMacへの保存も確認した。Codex内ブラウザーで保存したZIPは公開ハッシュと一致し、Finderの標準展開後も隔離属性を保持したまま同梱Nodeと起動スクリプトを実行できた。モデルによる導入相談の一巡は引き続き未確認である。

公開用の導入画面は、合成した配布URLで別途確認した。16件のビルド済みChrome確認と1件の表示テストが通り、対応版の正確な依頼文、クリップボード処理が成功を返す場合と拒否する場合、未公開・対応外の表示、390pxでの横はみ出しなし、ローカル設定への変更要求なしを確認した。コピーAPIと公開HTTPSはテスト用の代替であり、本物の配布元からのダウンロードやOSのクリップボード確認ではない。型・CSP・ローカル／公開用の両ビルドも通っている。
