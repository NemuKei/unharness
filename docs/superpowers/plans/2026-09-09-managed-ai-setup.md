# 管理SkillとAIによる設定相談 実装計画

> **For agentic workers:** Use `superpowers:executing-plans` task by task in the existing task. Preserve unrelated changes; additional agents are not required.

**Goal:** Unharnessの管理入口を零式でも保持し、利用者のAIとの相談から、モデルに合わせた設定の版を安全に保存する。

**Architecture:** 管理機能の識別と保護はローカルの登録・計画処理が担当する。Skillは相談と操作の呼び出しを担当し、設定ファイルを独自に書き換えない。新しい設定と対象範囲の移行は、既存の履歴と復旧を保つ共通サービスへ集約する。

**Tech Stack:** Node.js 24+、既存のローカルMCP・登録ソース・設定プリセット、Codex / Claude Code用の同梱Skill。

**Spec:** [設定相談](../../spec-guided-setup.md)、[製品仕様](../../spec.md)、[統合計画](2026-09-09-mac-product-experience.md)。

## 共通条件

Unharness管理Skillと必要なMCP・復旧経路、メモリ、作業継続、権限、管理ポリシー、必須のプロジェクト要件を保持する。外部Skillの「解除」は、対応する範囲で自動使用を止めて明示呼び出しを残す。現行の古いTRUEFORM記録を新しい意味に書き換えない。新規有料サービスや実設定の未確認登録は行わない。

## タスク1: 管理機能を解除対象から外す

**ファイル:** 新規`src/setup/control-sources.mjs`、変更`src/setup/preset.mjs`・`src/sources/service.mjs`・`src/sources/session.mjs`、テスト`test/setup-control-sources.test.mjs`・`test/setup-preset.test.mjs`。

**新しい境界:** `assertControlPreserved({ selectedIds, changedFileIds, control })`は、ローカル導入記録から確認した`control.sourceIds`と`control.fileIds`への解除・変更を拒否する。`control`はGUIやAIの申告から作らず、登録済みの導入先と内容の版から解決する。

- [ ] 管理Skill自身、MCP登録、親ファイルごとの変更による巻き込みを拒否するテストを追加し、既存の任意Skillは引き続き選択可能であることを確認する。

```js
const manager = 'skill-' + 'a'.repeat(64);
assert.throws(() => assertControlPreserved({
  selectedIds: [manager], changedFileIds: [],
  control: { sourceIds: [manager], fileIds: ['mcp-registration'] },
}), error => error.kind === 'setup-required-control');
assert.doesNotThrow(() => assertControlPreserved({
  selectedIds: ['skill-' + 'b'.repeat(64)], changedFileIds: [],
  control: { sourceIds: [manager], fileIds: ['mcp-registration'] },
}));
```

- [ ] 新規テストを実行して未実装の失敗を確認し、登録・モード計画・プリセット更新の入口で同じ保護を適用する。
- [ ] 名前に「Unharness」が含まれるだけの別Skillを例外にしない。導入記録と独立編集の不一致は競合として表示し、勝手に元へ戻さない。
- [ ] インベントリーの共通条件に「Unharness管理機能を保持」を表示する。TRUEFORMを全指示・全Skillが存在しない状態と説明しない。
- [ ] `node --test test/setup-control-sources.test.mjs test/setup-preset.test.mjs test/user-sources.test.mjs test/claude-sources.test.mjs`を実行し、対象の差分をレビューして保存する。

## タスク2: モデルを記録したプリセットと対象範囲の移行

**ファイル:** 既存`src/setup/preset.mjs`、新規`src/setup/records.mjs`・`src/setup/service.mjs`、変更`src/sources/records.mjs`・`src/sources/transaction.mjs`・`src/ai/tools.mjs`、テスト`test/setup-migration.test.mjs`・`test/setup-preset.test.mjs`。

**境界:** `reviewSetup({ workspace, proposal })`は現在のインベントリーとNormalに結び付いたレビューIDを作る。`applySetup({ workspace, reviewId })`だけが確認済みのレビューを適用する。外向きのMCPでは既存の`connectionId`と`requestId`の契約を使う。レビューIDは人の同意を自動的に証明しない。

- [ ] 既存の`validatePresetProposal` / `compileReleasePreset`と5件のテストを読み、承認されていない提案データが設定変更へ進めないケースを先に追加する。
- [ ] 自作・外部・不明の分類、実際のモデル、公式参照URLと確認日、理由、選択した自動／明示呼び出しを変更できない版として保存する。
- [ ] 不明な由来・役割を本人が判断する前に登録しない。新しいモデルが出ても既存設定を自動で変更しない。
- [ ] 既存の件数・記録容量の上限を確認する。管理できなかった候補を黙って省いて「すべての自作Skillを扱った」と表示しない。制御や保存の不足は具体的に示し、上限変更が必要ならその範囲を検証する。
- [ ] 旧Normal・お気に入り・比較・復旧記録を保つ移行を追加する。旧TRUEFORMの保存版を、新しい「自作Skillは明示呼び出し」の構成へ無断変換しない。
- [ ] 確認後のファイル変更、保持設定の変更、進行中の復旧、対象の追加・削除、重複適用、途中停止をテストする。失敗時は旧履歴と独立編集を保持する。
- [ ] `node --test test/setup-preset.test.mjs test/setup-migration.test.mjs test/user-sources.test.mjs test/claude-settings.test.mjs test/claude-recovery.test.mjs`を実行して移行境界を保存する。

## タスク3: 同梱の管理Skillと新しいSkillの扱い

**ファイル:** 新規`skills/unharness/SKILL.md`と必要なアプリ別メタデータ、変更`src/ai/tools.mjs`、導入情報は`src/setup/`へ置く。テスト`test/ai-server.test.mjs`・`test/setup-skill-lifecycle.test.mjs`。

- [ ] 管理Skillの入口を「開く・状態確認・設定相談・保存・切替・復旧」に限定する。画像制作の詳細は別の作成Skillへ分ける。
- [ ] 零式でも「アンハーネスを開いて」「Normalへ戻して」の明示依頼を処理できる状態を維持する。別の任意Skillの停止や低い負荷のために管理入口自体を停止しない。
- [ ] 初期設定は選択されたモデルの公式ガイドと実際のアプリ機能を確認して提案する。モデル別ガイドがなければ、その事実と使った広いガイドを明示する。
- [ ] 初回は「零式で初期設定を見直す」を推奨する。最小限の機械的な一覧取得・現在のNormal保存・任意対象の確認を先に行い、確認済みの対象だけを零式へ切り替える。未分類のソースを先に外さない。
- [ ] 零式用の設定を準備した後は新規タスクへ移り、そのアプリで取得できる読み込みの証拠を確認してからAIとの棚卸しを進める。保存した元の設定は検討資料として渡す。現在の会話に既に読み込まれた指示が消えたとは扱わない。
- [ ] 初回の零式が確認できない場合は理由を示して現在の構成での相談も選べるようにする。モデル変更や後日の見直しを自動で零式へ切り替える条件にしない。
- [ ] Unharnessを通した新規Skill作成では、普段のSkill作成機能に制作を任せ、完成後に役割確認・新しいNormal版・現在のモードへの反映をレビューする。設定操作はローカルサービスに任せる。
- [ ] 自作と確認した新規Skillは、Normalでは通常設定へ追加し、UNSEALでは自動使用を相談し、TRUEFORMでは明示呼び出しを基本にする。未確認の由来を自作扱いしない。
- [ ] Unharness以外で追加されたものは、次の起動・相談・棚卸しで差分を示す。Skillだけで常時監視できるとは説明しない。既存の比較結果を新しい構成の評価へ引き継がない。
- [ ] Skillの構造検査に加え、上の依頼を新規のCodex / Claude Code Desktopタスクで実行して確認する。Claude固有の実装・検証はClaude Codeが担当し、Codexが結果と差分をレビューする。

## タスク4: シンプルなGUIと新規タスクへの案内

**ファイル:** `web/src/SourceWorkbench.tsx`・`web/src/components/SourceInventory.tsx`・`web/src/components/PreparedState.tsx`、新規`web/src/SetupHandoff.tsx`、テスト`test/web-setup.test.mjs`。

- [ ] 「AGENTS.md / CLAUDE.md」「Skills」をそのまま表示名に使い、登録した範囲と新しく発見した候補を区別する。
- [ ] モードの近くに「設定をAIに相談」、初回に「AIと初期設定を作る」を置く。詳細な項目選択はAIとの相談へ渡し、大きな設定フォームを通常画面へ増やさない。
- [ ] 相談は必要な要約と参照IDだけを含む文面を作る。実機確認した入力欄への受け渡しを優先し、コピーも残す。ボタンを押しただけでAIへ依頼を送信しない。
- [ ] 切替後に「この設定で新しいタスクを始める」を案内する。準備済みと、特定のタスクで観測した状態を分け、古い会話に即時反映済みとしない。
- [ ] 対応アプリでの新規タスクへの導線、コピー失敗、未接続、既存タスク、モデル変更、不明な状態、キーボード操作をビルド済み画面で確認する。
- [ ] 初回導線では、保存前の切替がない、役割未確認のソースを変更しない、推奨を選ばなければモードを保つ、切替後に新規タスクを要求する、反映不明を確認済みとしない、元のNormalへ復帰できる、というケースを確認する。
- [ ] `npm run check`、`npm run build`、`node --test test/web-setup.test.mjs test/web-ai-updates.test.mjs`を実行する。実機の読み込みはブラウザーテストと別の証拠で残す。
