# 公式プラグインを基準にしたモード継承 実装計画

> **For agentic workers:** Use `superpowers:executing-plans` task by task in an isolated branch. Steps use checkbox (`- [ ]`) syntax. This PR changes documentation only; do not treat it as implementation, native qualification, or permission to alter personal configuration.

**Goal:** 零式で残せる任意の自動Skillを確認済みの公式プラグインに限定し、限定解除がその全部を継承して、外部Skill・自作Skillを追加できるようにする。

**Architecture:** 掲載元・導入済み内容の確認はアプリ側の読み取り処理、対象の合成は共通の純粋な処理、保存・移行・適用・復旧は既存サービスが担う。GUIとAIは同じレビューを使い、二つの独立した自動使用リストを保存しない。Normalと過去の構成は新しい規則へ無断変換しない。

**Tech Stack:** Node.js 24+、既存ES modules・Node test runner・React / TypeScript・ローカルMCP。新しい有料サービス、ホスト側キャッシュの書換え、常時オンライン照会を必須にしない。

**Spec:** [零式の公式プラグインと限定解除への継承](../../spec-mode-inheritance.md)、[対象範囲](../../harness-scope.md)、[設定相談](../../spec-guided-setup.md)。

## 共通条件

- 初回はMac Codex。ClaudeとWindowsの新規則対応は、それぞれの実機確認後に追加する。
- Skillの「残す」は自動使用を残すこと。「外す」は制御可能な有効Skillの明示呼び出し化であり、削除やプラグイン全体の無効化ではない。
- `UNSEAL = TRUEFORM ∪ 追加対象`を同じ登録範囲・同じ保存版の中で保証する。Normalとの包含関係は要求しない。
- 管理機能、メモリ、標準の作業継続、必須要件、権限を維持する。Normalで無効なSkillを勝手に有効化しない。
- 公式由来の証拠、所有範囲・任意性、制御可能性、タスクでの読み込みを別に確認する。GUIやAIからの「公式」申告は証拠にしない。
- 保存・採用は現在の準備状態を変えない。適用は既存の計画・競合確認・復旧を通す。過去の保存版を保持する。
- 自動使用の継承だけを追加し、外観、公開ドメイン、配布、比較採点の独立した機能を作り直さない。

## 開始時点と置き換える計画

調査基準は`codex/mac-finish`の`35b45668335b7b09e1036592f9aef55053758020`。実行時には最新差分を確認し、未コミット変更を上書きしない。

現在の`src/codex/catalog.mjs`は`skills/list`から`pluginId`を保持するが、それだけでは公式掲載元を証明しない。`src/setup/preset.mjs`のv1は`unseal.automaticSkillIds`と`trueform.automaticExternalSkillIds`を独立に受け付け、`src/setup/records.mjs`もそれぞれから保存内容を確認している。`src/setup/service.mjs`は両プリセットを固定し、採用時に設定ファイルを変更しない。この保存・復旧の性質を残し、公式由来と集合継承を追加する。

[2026-09-09の管理・設定相談計画](2026-09-09-managed-ai-setup.md)の管理保護、Normal保持、初回導線、追加登録は継続する。モードの選択規則・提案形式・移行・継承表示は本計画を優先する。[Mac製品計画](2026-09-09-mac-product-experience.md)の設定相談の完了判定へ、下記の実機確認を追加する。以前の合格結果を新規則の合格として数えない。

## タスク1: 公式由来と制御能力を読み取り専用で確認する

**ファイル:** 読む`src/codex/catalog.mjs`・`src/codex/rpc-client.mjs`・`src/apps/codex.mjs`・`src/setup/control-sources.mjs`。新規`src/codex/plugin-provenance.mjs`・`test/plugin-provenance.test.mjs`・`docs/evidence/2026-09-10-plugin-provenance-macos.md`。必要なアプリ別の情報追加だけを既存カタログへ行う。

**境界:** 新規`projectPluginProvenance({ application, runtimeVersion, installed, directory })`は、アダプターが取得した導入記録と確認済みの公式掲載記録を受け取り、`{ plugins, issues }`を返す。各`plugins`項目は`{ id, eligibility, sourceRevision, skillIds, evidence }`を持つ。`eligibility`は`official-confirmed`・`not-official`・`unknown`、`evidence`は掲載元ID・プラグインID・配布元・版・内容ID・確認日時の正規化された記録。HTTP/MCP提案からこれらを注入できない。これは新設する内部境界であり、存在未確認のCodex API名ではない。

`contentId`は、その確認で対象にしたローカルSkill本文・呼び出しポリシー等の範囲を明示した内容版とする。上流配布物全体のdigestを意味せず、独自の真正性保証へ広げない。掲載・導入の対応、ローカル内容の固定、各方向の制御能力を別々に判定する。名前や版を揃えたコピーを新しいハッシュだけで再認定しない。

- [x] 選択した実機版の公式資料と利用できる読み取りコマンドを確認し、実際の取得経路・フィールド・不足項目を証拠文書に残す。2026-09-10の[調査](../../evidence/2026-09-10-plugin-provenance-macos.md)で公開掲載と導入状態の別取得を確認した。製品として使える掲載・導入・ローカル対象の結び付けは未資格であり、公式由来は`unknown`のまま。プラグインの自動使用だけを変える制御も別途未確認である。公式候補の実装・新規則対応済みとは扱わない。
- [ ] 合成記録で、同名の私設マーケット、`pluginId`だけの記録、ローカルコピー、内容変更、別アプリ、未対応の取得形式を公式認定しない失敗テストを書く。公式ディレクトリ掲載の第三者製で対応が確認できた場合は候補になることも含める。
- [ ] `node --test test/plugin-provenance.test.mjs`で新規境界が未実装のため失敗することを確認し、上記の正規化と拒否条件だけを実装して再実行する。
- [ ] プラグインの対象Skill一覧、手動化可能性、MCP・hook・権限への副作用を分けて記録する。未知の入力やAPIエラーに元データを含めず、設定・キャッシュ・モデルタスクを変更しない。
- [ ] 読み取りだけで元の設定とファイルが変わらないことを確認し、対象差分をコミットする。取得不能は制約として記録し、このタスクを「公式プラグイン対応済み」にしない。

## タスク2: 零式から限定解除への対象合成を一か所にする

**ファイル:** 新規`src/setup/mode-inheritance.mjs`・`test/mode-inheritance.test.mjs`。変更`src/setup/preset.mjs`・`src/sources/errors.mjs`。

**境界:** `resolveModeSkillSets({ plugins, skills, retainedOfficialPluginIds, additionalAutomaticSkillIds })`を作る。`plugins`はタスク1の内部結果、`skills`は確認済み登録とNormalから得る`{ id, enabled, normalAutomatic, manualControl, automaticControl, requiredControl }[]`。`normalAutomatic`は実際の保存状態、二つのcontrolは各方向への変更能力を表す。既に手動のSkillを自動として選んだのに元の状態のまま「自動」と表示することを防ぐ。戻り値は順序を正規化した`{ trueformAutomaticSkillIds, unsealAutomaticSkillIds, inheritedSkillIds, additionalSkillIds }`。必須管理機能は任意集合に含めず、既存の管理保護を両モードで別途適用する。

2026-09-10に[共通の純粋処理](../../../src/setup/mode-inheritance.mjs)と35件の合成テストを実装した。未知の由来、無効状態、継承の削除、登録外の対象、管理機能、自動・手動の両方向の未対応を検査する。これ単体では掲載元を認証せず、設定・保存記録も変更しない。v1のコンパイラーは旧規則のまま保持し、v2のサービス・記録・入口への接続を以下のタスク3〜4で行う。

- [ ] 下記を含むテストを書き、`node --test test/mode-inheritance.test.mjs`で未実装の失敗を確認する。入力は製品データではない合成フィクスチャとする。

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveModeSkillSets } from '../src/setup/mode-inheritance.mjs';

test('UNSEAL inherits TRUEFORM and adds only the reviewed extras', () => {
  const result = resolveModeSkillSets({
    plugins: [{ id: 'official-a', eligibility: 'official-confirmed',
      sourceRevision: 'fixture-v1', skillIds: ['a'], evidence: {
        directoryId: 'fixture-directory', pluginId: 'official-a',
        distribution: 'fixture-source', version: 'fixture-v1',
        contentId: 'f'.repeat(64), checkedAt: '2026-09-10T00:00:00Z',
      } }],
    skills: ['a', 'b', 'c'].map(id => ({ id, enabled: true, normalAutomatic: true,
      manualControl: true, automaticControl: true, requiredControl: false })),
    retainedOfficialPluginIds: ['official-a'],
    additionalAutomaticSkillIds: ['b', 'c'],
  });
  assert.deepEqual(result.trueformAutomaticSkillIds, ['a']);
  assert.deepEqual(result.unsealAutomaticSkillIds, ['a', 'b', 'c']);
  assert.deepEqual(result.inheritedSkillIds, ['a']);
  assert.deepEqual(result.additionalSkillIds, ['b', 'c']);
});
```

- [ ] 上の識別子と証拠は単体テスト専用の合成記録とする。実サービスではアダプター由来の記録だけを受け入れ、同じ内容をGUIやAIが申告しても公式認定できないことを入口テストで確認する。
- [ ] 空の零式、複数の公式プラグイン、重複、順序違い、未登録Skill、未確認の公式、無効なSkill、手動化不能、管理Skillの誤選択を追加する。`mode-inheritance-invalid`・`plugin-origin-unverified`・`setup-manual-control-unavailable`等の固定エラーと、ファイル変更0件を確認する。
- [ ] 零式から外して限定解除だけへ残す場合は追加選択を明示的に要求する。重複を継承側へ一本化し、Normalで無効な項目を候補選択だけでONにしない。保存済みの関係を後から不一致に改変した場合も拒否する。
- [ ] `node --test test/mode-inheritance.test.mjs test/setup-preset.test.mjs test/setup-control-sources.test.mjs`を通し、純粋な処理と呼出し側の差分をコミットする。

## タスク3: 新形式と旧版の復帰を分離する

2026-09-10に[保存処理の合成検証](../../evidence/2026-09-10-mode-inheritance-storage.md)を追加した。v2の内部インベントリー、両方の凍結版、採用時・新規準備時の内容照合、旧writerを拒否するworkspace形式と中断時の二つの記録の復旧まで実装した。従来のsnapshot形式・Normal・過去の復帰先は維持している。次のタスク4〜6と、公式プラグインの実機資格は未完了であり、Mac完成とは扱わない。

**ファイル:** 変更`src/setup/preset.mjs`・`src/setup/records.mjs`・`src/setup/service.mjs`・`src/sources/records.mjs`・`src/sources/retained-settings.mjs`。テスト`test/setup-preset.test.mjs`・`test/setup-migration.test.mjs`・`test/control-recovery.test.mjs`。

**境界:** v2提案は既存の`scopeId`・`normalId`・`basis`・`roles`に、現在の`inventoryId`、`trueform.retainedOfficialPluginIds`、`unseal.instructions`、`unseal.additionalAutomaticSkillIds`を持つ。公式資格と展開後の一覧はサービスが同じインベントリーから固定する。v1の独立リストとv2を同じ意味で読むことはしない。`reviewSetup`・`applySetup`・`readSetup`・`savedPresetForMode`の既存の操作分離は維持する。

- [ ] v1のNormal・解除プリセット・お気に入り・比較・復旧記録を固定した回帰フィクスチャを作る。v2を採用しても元の記録IDと内容、現在の準備状態が変わらないことを失敗テストにする。
- [ ] 公式資格をAIの提案に埋めて偽装する、古いインベントリーを使う、掲載元やSkillの内容を入れ替える、別scopeのプラグインを選ぶ、旧形式へ新フィールドを混ぜるケースを拒否する。
- [ ] 新しい規則の版・確認済みプラグインの版・対象一覧・継承と追加・両方の凍結スナップショットを同じレビューに保存する。保存時と読み戻し時にタスク2の同一性を確認し、記録の改変を拒否する。
- [ ] 零式変更の影響を両モードで提示して一つの新しい設定版を採用する。旧版は旧規則として復帰でき、最新の零式を注入しない。新形式を理解しない以前の書き込みプログラムが拒否することを、実際の旧版でも確認する。
- [ ] `node --test test/setup-preset.test.mjs test/setup-migration.test.mjs test/control-recovery.test.mjs`を通す。中断復旧がネット接続・モデル・GUIなしでも使え、独立編集を保持することを確認してコミットする。

## タスク4: 追加登録とGUI・CLI・MCPのレビューを揃える

**ファイル:** 変更`src/setup/enrollment.mjs`・`src/setup/enrollment-records.mjs`・`src/setup/service.mjs`・`src/sources/session.mjs`・`src/ai/tools.mjs`。テスト`test/source-enrollment.test.mjs`・`test/setup-entrypoints.test.mjs`・`test/enrollment-entrypoints.test.mjs`・`test/ai-server.test.mjs`。

**境界:** 各入口はインベントリー中のプラグイン／Skill IDだけを受け取り、任意パスや公式資格の上書きを受け取らない。共有サービスがv2を検査する。プラグイン内の新しいSkillは、既存の追加登録後に新しいインベントリー・設定レビューを要求する。

- [ ] GUIを経由しない直接のCLI/MCPからも、継承を外す要求、偽の公式資格、未知のID、範囲の追加を拒否するテストを先に追加する。
- [ ] プラグイン更新、掲載元変更、Skill追加、独立編集、古いレビュー、二重送信と応答消失をテストする。更新で新しいSkillが無断で零式や限定解除へ加わらないことを確認する。
- [ ] 同じレビューがすべての入口で同じ対象・設定版・変更件数を返すよう接続する。保存だけなら設定ファイル変更0件、準備は別操作、再送は元の操作IDという境界を維持する。
- [ ] 未確認の由来を補うために常時オンラインにせず、保存済みの確認版と現在の内容が一致する場合の動作、オフラインでの新規確認保留、Normal復帰をそれぞれ確認する。
- [ ] `node --test test/source-enrollment.test.mjs test/setup-entrypoints.test.mjs test/enrollment-entrypoints.test.mjs test/ai-server.test.mjs`を通し、操作境界をコミットする。

## タスク5: 設定相談と継承表示を更新する

**ファイル:** 変更`skills/unharness-setup/SKILL.md`・`web/src/SetupHandoff.tsx`・`web/src/SourceWorkbench.tsx`・`web/src/setup.ts`・`web/src/sources.ts`。テスト`test/web-setup.test.mjs`・`test/web-enrollment.test.mjs`。管理Skillは新しい説明への参照が必要な範囲だけ変更する。

- [ ] 「零式から引き継ぐもの」「限定解除で追加するもの」が分かれ、限定解除だけで継承項目を外せないこと、公式未確認を選べないことをブラウザーテストに追加する。
- [ ] 初期相談で公式候補の全選択をしない。空の零式も許容する。利用者の由来確認と公式掲載の証拠を混同せず、自作・その他の外部Skillは限定解除の追加として相談する。
- [ ] 通常の画面に大きな選択フォームを増やさず、詳細はAI相談、採用前は両モードの差分確認という既存の流れを使う。項目数は確認した実状態から出し、無効・未確認・未登録の範囲を隠さない。
- [ ] 「次の新規タスク向け」「同じCodex環境で共有される変更」、旧規則のお気に入り、保存後まだ未適用の状態を表示する。コピー失敗、切断、古いタブ、狭い画面でも復帰操作を保持する。
- [ ] `npm run check`、`npm run build`、`node --test test/web-setup.test.mjs test/web-enrollment.test.mjs`を実行し、ビルド済み画面の表示・キーボード操作を確認してコミットする。

## タスク6: Mac実機で新規則を確認し、公開説明を更新する

**ファイル:** 新規`docs/evidence/2026-09-10-mode-inheritance-macos.md`。確認後に変更`docs/status.md`・`docs/compatibility.md`・`docs/spec-guided-setup.md`・`docs/ai-commands.md`・両README。必要な修正とテストは発見した責務へ限定する。

- [ ] 実行時のMac・Codex Desktop・ネイティブ実行環境・コミットを記録する。対象と変更範囲を確認し、Normalと外部の復旧手段を用意する。合成プラグインを本物の公式掲載の証拠に使わない。
- [ ] 公式由来を確認でき、操作対象として承認された導入済みプラグインで、零式に残す対象と限定解除だけの外部／自作Skillを準備する。個人対象の新しい登録や導入はその操作の明示確認を得る。未対応なら制約を記録し、合格扱いにしない。
- [ ] Normal→零式→限定解除→零式→NormalをGUIとAIの両入口で通す。新規タスクの記録で零式の対象が限定解除でも残り、追加分だけが手動へ戻ることを確認する。非自動Skillの明示呼び出しも別に確かめる。
- [ ] 零式選択の変更と両モードの新しい保存版、古いお気に入りの復帰、更新差分、切断、中断、オフライン復旧、管理機能の保持を確認する。以前の比較記録が変わらないことも確認する。
- [ ] `npm ci --ignore-scripts`、`node --test`、`npm run check`、`npm run build`とDocsの相対リンク・`git diff --check`を実行する。テスト件数、失敗・skip、実機で確認できない項目をそのまま記録する。合格した組合せだけ現在の対応表へ追加する。

## このDocs PRでの完了範囲

本PRはモードの合意、主要Docsの整合、実装順と確認条件の提示まで。上記チェックは未実行の実装作業であり、仕様をマージしても現在のアプリ・個人設定・保存版は変わらない。新しい公式由来判定や継承が動作すると案内するのは、対応する実装と実機確認が揃ってからとする。
