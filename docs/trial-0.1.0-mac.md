# 0.1.0開発版をこのMacで試す手順

0.1.0の[チャット主導への再設計](superpowers/specs/2026-09-23-chat-led-redesign.md)を、公開前に作者のMacとCodex Desktopで確かめるための手順。公開・release・tagはこの手順に含まない。

## 前提と安全の約束

- 対象はApple Silicon Mac、Codex Desktop、公開中の0.0.11を導入済みで、登録（通常装備の保存）が済んだ環境。
- 開発版はバージョン表示が `0.0.11` のまま。見分けは `installation_status` の配布ID（distribution ID）と `sourceRevision` で行う。
- 開発版は、保存データの場所に `proposals.json`、`proposals.lock`、`preparation-history.jsonl` と、`input` の記録（提案）を追加する。既存の保存形式は変えない。0.0.11はこれらを読まず、保存データの場所の一覧も調べないため、0.0.11へ戻しても読み込みは妨げられない（2026-09-24にコードで確認。手順6で実機でも確かめる）。
- 作業の前に、必ず独立した復旧の写し（手順1）を作る。途中で不安になったら、そこで止めて0.0.11へ戻せる。
- 個人の設定ファイルを手で書き換えない。入れ替えは[更新の手順](plugin-update.md)のCodexのコマンドだけで行う。

## 手順

### 0. 今の状態を記録する（読むだけ）

Codexの新しいタスクで「アンハーネスの状態を確認して」と頼み、次を控える。

- 今のモード（例：零式）
- `installation_status` の版・配布ID・導入元のパス
- 保存データの場所（native data directory）

### 1. 独立した復旧の写しを作る

導入済みの0.0.11から実行する。AIに頼む場合は「アンハーネスの独立した復旧の写しを作って」。

```text
<導入済みの0.0.11のルート>/scripts/unharness plugin recovery --data-directory <手順0で控えた保存データの場所>
```

返ってきた `Open Unharness Recovery.command` のパスを控える。プラグインを外した後でも、これで通常装備へ戻せる。

### 2. 開発版を組み立てる

プラグインの外、repoの外の新しいフォルダーに組み立てる。[組み立ての手順](plugin-package.md)に従い、公式のNode.js 24.20.0（darwin-arm64）のアーカイブとSHA256を照合してから実行する。

```text
node scripts/build-plugin.mjs --output "<新しいフォルダー>/unharness" --runtime-archive "<照合済みのNodeアーカイブ>"
```

結果のJSONで、`sourceRevision` が試したいcommit、`sourceDirty` が `false` であることを確かめる。

Codexの導入元は、組み立てた `unharness` そのものではなく、0.0.11と同じ形の配布フォルダーにする（[配布の形](mac-installation.md)）。repoの外に新しく作る。

```text
<配布フォルダー>/
  .agents/plugins/marketplace.json   # packaging/mac-release/marketplace.json の写し
  plugins/unharness/                 # 組み立てた unharness をそのまま写す
  はじめに.md                         # packaging/mac-release/はじめに.md の写し
```

写した後、`<配布フォルダー>/plugins/unharness/scripts/unharness plugin status --data-directory <保存データの場所>`（読むだけ）で、`versions.files` の配布IDと `sourceRevision` が組み立ての結果と一致することを確かめる。

### 3. 導入元を入れ替える

[更新の手順](plugin-update.md#qualified-native-source-replacement)のとおり、1つずつ結果を確かめながら実行する。`<Codex>` は `/Applications/ChatGPT.app/Contents/Resources/codex`、`CODEX_HOME` は実際に使っているCodex home。0.0.11の導入元フォルダーは消さずに残す（戻すときに使う）。

```text
<Codex> plugin marketplace list --json
<Codex> plugin marketplace remove deltahelmlab-unharness --json
<Codex> plugin marketplace add "<配布フォルダー>" --json
<Codex> plugin add unharness@deltahelmlab-unharness --json
```

### 4. 導入元の変更だけを取り込む

入れ替えでCodexの設定の導入元が変わるため、Unharnessが「保存時と設定が違う」と表示することがある。これは通常装備を取り直す理由ではない。[更新の手順](plugin-update.md#preserve-the-new-native-source-without-resetting-normal)のとおり、差分が導入元の変更だけであることを確かめてから、`plan_retained_settings` → `accept_retained_settings` で取り込む。

### 5. 新しいタスクで確かめる

Codex Desktopを再読み込みし、**新しいタスク**で次を順に試す。気づいたことは、言葉の分かりにくさも含めて控える。

| # | 操作 | 期待すること |
|---|---|---|
| 1 | 「アンハーネスの状態を確認して」 | 配布ID・`sourceRevision` が手順2の開発版。今のモードが手順0と同じ |
| 2 | 「アンハーネスを開いて」 | 普段の画面：今のモード、零式・限定解除、[元に戻す]、使用量の目安（最初は「まだ目安がありません」） |
| 3 | 「零式と限定解除のSkill構成を見直して」 | AIが外す・足すものを理由つきで提案し、画面に提案カード（名前 — 理由）が出る |
| 4 | 提案カードで [やめる] | 提案が消え、設定は変わらない |
| 5 | もう一度提案してもらい、今度はチャットで「それでお願い」 | 1回だけ適用される。画面にも結果が出る |
| 6 | 画面で [元に戻す] → 確認 → [切り替える] | 「次の新しいタスクから通常装備です」と [新しいタスクを始める] |
| 7 | 新しいタスクで零式に戻す | 普段どおり零式で仕事ができる |
| 8 | 数日使った後、画面を開く | 零式の使用量の目安が出る。限定解除を試していれば比べた目安も出る |

### 6. 0.0.11へ戻す場合

[更新の手順](plugin-update.md)の戻し方に従い、手順3で残した0.0.11の導入元を `plugin marketplace add` し直して、`plugin add` で0.0.11を入れる。その後、新しいタスクで「アンハーネスの状態を確認して」と頼み、次を確かめる。

- 版と配布IDが0.0.11に戻っている
- 今のモード・通常装備・お気に入りが読める（開発版が追加したファイルがあっても止まらない）

うまくいかない場合は、手順1の `Open Unharness Recovery.command` で通常装備へ戻す。

## 結果の残し方

試した日付、`sourceRevision`、手順5の各項目の結果（期待どおり／違った点）、言葉で分かりにくかったところを、GitHub Issueか `docs/evidence/` の新しい記録に残す。実機で確かめるまでは、status・READMEで0.1.0の実機確認を済みと書かない。
