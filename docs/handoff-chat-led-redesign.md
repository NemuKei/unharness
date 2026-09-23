# Sol向け指示書：チャット主導への再設計（0.1.0）

この文書は、Codex（`gpt-6-sol`）が再設計の重い実装とコードレビューを担当するための入口。設計と画面の監修はClaude（Opus）が担当する。

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
