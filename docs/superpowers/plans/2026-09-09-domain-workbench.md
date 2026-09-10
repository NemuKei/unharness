# 独自ドメインとローカル接続 実装計画

> **For agentic workers:** Use `superpowers:executing-plans` task by task in the existing task. Preserve unrelated changes; additional agents are not required.

**Goal:** 「アンハーネスを開いて」から、独自ドメインの操作画面をCodex Desktop内に開き、登録済みのローカル設定へ接続する。初回のMac完成はCodexを対象にし、Claude固有の導線・実機確認は後続にする。

**Architecture:** 既存の`startGuiServer`とローカルMCPを使い、プロセス所有の確認・接続の紐付け・公開UI用の狭いAPIを分ける。従来の同一origin用認証は保持し、公開originには別の明示した接続権限を与える。

**Tech Stack:** Node.js 24+標準HTTP・crypto、既存のReact / TypeScript / Vite、ローカルMCP。

**Spec:** [独自ドメインの契約](../../spec-domain-entry.md)、[統合計画](2026-09-09-mac-product-experience.md)。[管理Skill計画](2026-09-09-managed-ai-setup.md)の保護された管理入口を使う。

## 共通条件

個人設定を保存する運用サーバーを作らない。ローカルはloopbackのみで待ち受け、許可origin・Host・接続認証・CSRF・入力制限・操作の重複を検査する。公開サイトの改ざんをoriginチェックだけで防げると説明しない。公開・有料契約・利用者の未指定ドメインの信頼登録は実装から推論しない。

## タスク1: 固定した範囲の起動と再利用

**ファイル:** 新規`src/gui/launch.mjs`、変更`src/gui/server.mjs`・`src/ai/server.mjs`・`src/ai/tools.mjs`、テスト`test/gui-launch.test.mjs`。

**新しい境界:** `openWorkbench({ workspace })`は登録済みのローカル設定からだけ公開originを読み、`{ launchId, loopbackOrigin, webOrigin, protocolVersion }`を返す。公開originを呼出し引数で追加しない。MCPの`open_workbench`は既存の操作IDと接続IDを使う。

- [ ] 同じworkspaceでの二重起動、プロセス終了、再起動、ポートの再利用、古い起動記録をテストする。所有しないポートのプロセスは停止しない。
- [ ] 既存の`startGuiServer`へ、公開UIにも使える起動IDとプロトコル版を渡す。登録範囲と描画資産を固定して起動し、状態確認に成功した所有プロセスだけを再利用する。
- [ ] MCPのstdoutはプロトコルだけに保つ。設定本文、接続用トークン、個人の実行記録を通常ログへ書かない。
- [ ] `node --test test/gui-launch.test.mjs test/ai-server.test.mjs test/ai-session.test.mjs`を実行し、CLI専用の診断・復旧にGUI依存を持ち込んでいないことを確認する。

## タスク2: 一回限りの接続引換えと公開UI向けAPI

2026-09-10時点: [バックエンドと19件の新規テスト](../../evidence/2026-09-10-domain-bridge-backend.md)を実装。既存回帰を含む55件が通過した。ローカル認証済みAPIでの発行・承認、短期接続、同一接続の計画、操作結果の保持は確認済み。承認画面・MCPの引き渡し・公開クライアント・画像経路・実HTTPS接続が残るため、タスク全体は未完了。

**ファイル:** 新規`src/gui/pairing.mjs`・`src/gui/remote-policy.mjs`、変更`src/gui/server.mjs`・`src/ai/tools.mjs`、テスト`test/gui-pairing.test.mjs`・`test/gui-remote-policy.test.mjs`。

**新しい境界:** `createPairing({ launchId, scopeId, webOrigin, expiresAt })`はローカルの管理経路でのみ使用する。`redeemPairing({ ticket, origin, launchId, now })`は一回だけ接続権限へ引き換える。`authorizeRemoteRequest({ origin, host, session, operation })`は正確なorigin・Host・起動ID・scope・許可操作を確認する。引数の日時はテストで固定でき、実サービスではローカル時計を使う。

- [ ] 引換え前の許可、期限切れ、二度目の引換え、別origin・scope・起動ID、欠落トークン、偽Hostを先にテストする。

```js
const webOrigin = 'https://unharness.example.test';
const launchId = '00000000-0000-4000-8000-000000000001';
const scopeId = 'a'.repeat(64);
const now = Date.now();
const ticket = createPairing({
  launchId, scopeId, webOrigin, expiresAt: now + 60_000,
});
assert.throws(() => redeemPairing({
  ticket, origin: 'https://other.example.test', launchId, now,
}), error => error.kind === 'gui-request-forbidden');
const session = redeemPairing({ ticket, origin: webOrigin, launchId, now });
assert.throws(() => redeemPairing({ ticket, origin: webOrigin, launchId, now }),
  error => error.kind === 'gui-request-forbidden');
```

期限切れのケースでは、引換え時の`now`を`expiresAt`以降に進める。実サイトの初期値にこのテスト用originを使わない。

- [ ] 接続許可をローカルの信頼できる経路で確定する。公開ページ自身が許可を発行できないことを確認する。通常の接続トークンはブラウザーのメモリ内に保持し、URL・永続ストレージ・公開ログに保存しない。
- [ ] 同一originの既存APIと公開originのAPI権限を分ける。公開UIは状態要約・登録済み操作・作品画像など必要な機能だけを使い、任意パス・任意コマンド・設定やメモリの本文・生の会話の取得を許可しない。
- [ ] CORSのpreflightと実際の要求を検査する。ワイルドカード、許可したoriginの部分一致、別のsubdomainを拒否する。トークンはorigin許可の代わりにならない。
- [ ] 画像読み込みは専用の容量上限と権限を持つ経路へ分け、既存の16 KiB JSON上限を全APIで緩めない。
- [ ] `node --test test/gui-pairing.test.mjs test/gui-remote-policy.test.mjs test/gui-sources.test.mjs test/ai-requests.test.mjs`で実HTTPと再送・競合も確認する。

## タスク3: アプリ内表示と接続状態

**ファイル:** `skills/unharness/SKILL.md`、新規`web/src/connection.ts`・`web/src/ConnectionStatus.tsx`、変更`web/src/api.ts`・`web/src/App.tsx`・`web/src/source-updates.ts`、テスト`test/web-connection.test.mjs`。

- [ ] Skillがローカル起動情報を確認し、導入済みの正確な公開URLを現在のAIアプリのブラウザーへ渡す。対応するCodexの`open_in_codex`等は実際に利用可能かを調べ、Claude固有の開き方はClaude Codeが実装・検証する。
- [ ] `connection.ts`を接続処理の入口にし、`disconnected / pairing / connected / expired / incompatible / unknown`を区別する。接続なしの画面を勝手に設定変更可能な状態へ進めない。
- [ ] 公開UIの更新とローカル版が非互換なら、接続を止めて更新・ローカル画面への案内を出す。部分一致で操作を継続しない。
- [ ] 「このMac・Codex」等の接続先を一行で表示し、設定準備とタスクの観測を別にする。切断後も古い状態を確認済みとして表示しない。
- [ ] 既存タブと接続は確認して再利用する。URLの引き渡し情報は読み取り後に除去し、フッター等の外部リンクへ流出させない。
- [ ] 公開UIの配信コードと依存物をまとめ、広告・外部の解析スクリプトを操作画面へ入れない。CSP、外部リンク、エラー時の表示を確認する。
- [ ] `npm run check`、`npm run build`、`node --test test/web-connection.test.mjs test/web-ai-updates.test.mjs test/web-source-updates.test.mjs`を実行する。
- [ ] 本物のHTTPS originからのloopback接続をMacのCodex Desktopで確認し、許可・拒否・再接続・別タブ・状態変更の実機証拠を記録する。通常ブラウザーだけで合格にしない。

## タスク4: オフラインの復旧入口

**ファイル:** `src/gui/launch.mjs`・`src/gui/server.mjs`、新規`web/src/RecoveryEntry.tsx`、既存`web/src/components/RecoverySection.tsx`、テスト`test/gui-offline-recovery.test.mjs`。

- [ ] 同梱のビルド済みUIと、AIがなくても起動できるローカル手順を残す。初回導入時にその場所と起動方法を利用者が確認できるようにする。
- [ ] サイト・ネットワーク・AIを停止した条件で、設定と復旧点の読取、独立編集の検出、復旧、再読取をテストする。
- [ ] 作品の欠損や接続認証の失敗が設定の復旧を妨げないことを確認する。接続許可の取消しは作品やNormalの削除と分ける。
- [ ] `node --test test/gui-offline-recovery.test.mjs test/ai-recovery.test.mjs test/claude-recovery.test.mjs`と実際のMacでのネットワークなしの操作を行う。
- [ ] 宣言したMac版・アプリ版・公開UI版・ローカル版と確認日を[対応表](../../compatibility.md)へ記録する。
