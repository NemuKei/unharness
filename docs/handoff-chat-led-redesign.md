# Sol向け指示書：チャット主導への再設計（0.1.0）

この文書は、Codex（`gpt-6-sol`）が再設計の重い実装とコードレビューを担当するための入口。設計と画面の監修はClaude（Opus）が担当する。

## 2026-10-01 引き継ぎ（開発をCodex側へ移す）

利用者の判断で、ここからの開発はCodex側で進める。Claude（Opus）が担当していた設計・UI監修・軽い実装も、Codex側で引き継ぐ。

**mainに入っているもの（`30f16fe` まで、テスト全体 1261件成功・0件失敗）**
- 計画のTask 1〜6：呼び名と文言、管理Skill、AIの提案、普段の画面、初回の流れ・使用量・声かけ、公開操作と再実行の退役。
- Task 4b：Skillごとに「自動で使う／呼んだときだけ／使わない」を選ぶ画面。
- Task 6b：`-alpha` 付きの版の読み取りと、版ごと・操作ごとの許可（`src/codex/config-versions.mjs`）。
- Task 6c：別アプリによるSkillフォルダーの入れ替わりの確認と登録し直し。共通設定の差分が同時にある場合は、登録し直し → 共通設定の取り込み → 準備し直し、の順に案内する。
- Task 6d：新しいCodexの版をこのMacで自動確認する（`src/codex/config-self-qualify.mjs`）。0.155.0-alpha.16.4では read・disable・restore・plugin-disable が合格、enable は不合格。
- Task 7：文書の一部。Task 6b〜6d・4bの内容は `docs/status.md` に反映済み（本節と同時に更新）。

**利用者の実機の状態（repoの外）**
- Codexの導入元は開発版 `~/.local/share/unharness/releases/dev-30f16fe`（source revision `30f16fe`）。公開版0.0.11の導入元 `~/.local/share/unharness/releases/0.0.11` は残してある。独立した復旧の写し：`~/.codex/.unharness-workbench/recovery/copy-EbOfmm/Open Unharness Recovery.command`。
- 保存データは零式（revision 41）のまま。`~/.agents/skills/kanary` はKanaryアプリ自身の更新で入れ替わっており、零式で置いた `agents/openai.yaml` が消えている（Kanaryだけ自動で使われる状態）。Codexの共通設定にも2026-09-14以降の独立した変更がある。Unharnessはこれらを書き換えていない。
- 次の実機確認：Codex Desktopを再読み込み → 新しいタスクで「アンハーネスを開いて」→ kanaryの確認と登録し直し → 共通設定の取り込み → 零式の準備し直し。手順と過去の試行の記録は [0.1.0開発版をこのMacで試す手順](trial-0.1.0-mac.md)。0.0.11へ戻す場合も同じ文書の手順6。

**残っている作業**
1. 上記の実機確認（3回目の続き）。結果を `trial-0.1.0-mac.md` と `docs/evidence/` に残す。
2. 計画のTask 8：公開サイトのデモを0.1.0の呼び名・流れに合わせる。deployは利用者の承認後。その後、StreetEngineerの掲載文の修正案（「再生成」「出力の比較表示」「Webアプリ」表記、Mac＋Codex必須の明示）を利用者へ渡す。
3. 0.1.0のrelease判断（READMEの本文更新、版番号、配布ZIP、catalog）。releaseとdeployは利用者の承認が必要。
4. 0.2.0（Mac Claude Code）の計画を作る。仕様書の「Claude Code対応」と受入条件7。
5. 別repo（repo-template-codex）との役割整理：テンプレートの既定を零式相当へ軽くし、Claude Codeの `CLAUDE.md` とSkillの自動使用の可否をテンプレート側から書かない（仕様書の「Claude Code対応」）。これはrepo-template-codex側で扱う。

**これまでに分かった注意点**
- Codexは頻繁に自動更新される（1日で alpha.16.3 → 16.4）。版の固定ではなく、Task 6dの自動確認に頼る。
- 実機では、複数の変化（Skillフォルダーの入れ替わり、共通設定の変更、Codexの更新）が同時に起きる。合成環境では1つずつではなく重ねて試す。
- `test/fixtures` のファイルは `node --test` に直接拾われる。サーバー役のfixtureは、呼ばれ方を確かめてすぐ終了するようにする。
- 負荷が高いとテスト全体がtimeoutで取り消されることがある。個別に実行して時間を比べ、`--test-timeout` を長くして再実行する。
- sandbox内では `.git` に書き込めず、setuid・hardlinkのテスト1件が失敗する。

## 読む順番

1. [仕様書](superpowers/specs/2026-09-23-chat-led-redesign.md)：目的・体験・範囲・受入条件。
2. [実装計画](superpowers/plans/2026-09-23-chat-led-redesign.md)：Taskごとのファイル・インターフェース・テストで固定する振る舞い。
3. [AGENTS.md](../AGENTS.md) と [CONTRIBUTING.md](../CONTRIBUTING.md)：repo全体の約束と検証。

## 担当するTask

計画の **Task 3 → Task 4 → Task 5 → Task 6** を、この順に1つずつ進める。Task 1・2・7・8はOpusが担当する。着手時に `git log` で、前のTaskとOpusのTaskがmainに入っているか確認する。

最初に、Opusが実装したTask 1（`d65d2fa`）とTask 2（`7224acf`）をコードレビューする。範囲は `git diff f4d55ee..7224acf`。Playwrightの画面テスト（88件）はOpusの環境では実行されずskipされているため、`UNHARNESS_PLAYWRIGHT_MODULE` を設定できる環境なら実行して、文言変更に合わせた期待値の更新が正しいか確かめる。指摘は修正してから Task 3 に進む。

## 進め方

- 各Taskは、計画に書かれた「振る舞い」を先にテストにし、失敗を確認してから実装する。
- インターフェース（関数名・引数・戻り値・MCPツール名・HTTPの経路）は計画のとおりにする。変える必要があれば、実装前に理由を書いて利用者に確認する。
- 既存の安全装置（`planUserMode`、`applyUserPlan`、setupのreview/apply、復旧、独立編集の検出）を置き換えない。包んで使う。
- v1〜v4の保存構成、お気に入り、evidence、退役した機能のデータファイルを書き換え・削除しない。
- 文言は `text(ja, en)` で日本語を主に書く。画面の普段の表示に、パス・エラーコード・分類語を出さない。
- 各Taskの最後に、自分でコードレビューを行う（計画の「Review Focus」を必ず確認する）。そのうえでOpusの画面監修を待ち、指摘を反映してからcommit・pushする。

## 検証

```sh
npm ci --ignore-scripts
npm run check
npm run build
node --test
```

Task 6では `npm run build:site` も通す。公開サイトのdeploy、release、tag、配布ZIPの作成は行わない（利用者の承認後に別に行う）。

## 合成HOME（画面の確認）

開発中の画面を、利用者の `~/.codex`・`~/.agents/skills`・`~/.claude` へ向けない。一時directoryに合成HOMEを作って起動する。

```sh
S="$(mktemp -d)/fakehome"
mkdir -p "$S/.codex" "$S/project" "$S/.agents/skills"
printf '# 個人の追加指示（サンプル）\n\n- 作業前に必ず計画を3段階で書く。\n' > "$S/.codex/AGENTS.md"
printf 'model = "gpt-5"\n' > "$S/.codex/config.toml"
for n in weekly-report-writer slide-polisher research-helper; do
  mkdir -p "$S/.agents/skills/$n/agents"
  printf -- "---\nname: %s\ndescription: サンプルのSkill。\n---\n\n# %s\n" "$n" "$n" > "$S/.agents/skills/$n/SKILL.md"
  printf 'policy:\n  allow_implicit_invocation: true\n' > "$S/.agents/skills/$n/agents/openai.yaml"
done
printf '# Project\n' > "$S/project/AGENTS.md"
git -C "$S/project" init -q && git -C "$S/project" add -A && git -C "$S/project" -c user.email=demo@example.com -c user.name=demo commit -qm init
chgrp -R staff "$S"   # /private/tmp 配下は group が wheel になり、所有者確認で対象外になるため
HOME="$S" CODEX_HOME="$S/.codex" node bin/unharness.mjs gui --manage-sources \
  --codex-home "$S/.codex" --project "$S/project" \
  --codex /Applications/ChatGPT.app/Contents/Resources/codex --port 4790
```

表示されたURLは `http://127.0.0.1:4790` で開く（`localhost` では接続が拒否される）。合成の `config.toml` が最小のため、切替の適用が `config-transform-failed` になる場合がある。適用まで確かめるTaskでは、Codexが受け付ける `config.toml` を合成HOMEに用意する。

## 完了の報告

Taskごとに、変更したファイル、通したテスト、Review Focusの確認結果、未検証の範囲、Opusの監修で残った指摘を短く報告する。
