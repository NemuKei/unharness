# チャット主導への再設計 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 0.0.11 Macプレビューを、非エンジニアがチャットで始めて、画面で見て・承認して・戻せる0.1.0へ組み直す。

**Architecture:** 安全装置（計画 → 入力一致確認 → 適用 → 読み戻し → 復旧）は既存の `src/sources/service.mjs` の `planUserMode` / `applyUserPlan` と setup の review/apply をそのまま使う。新しく足すのは、それらを包む「提案」の記録と、その記録を表示・承認する画面だけ。公開サイトからの操作と再実行は退役する。

**Tech Stack:** Node.js 24（`node --test`、`.ts` を直接import）、React + TypeScript + Vite、zod（MCP入力）、ローカルHTTP（`src/gui/server.mjs`）。

**Spec:** [2026-09-23-chat-led-redesign.md](../specs/2026-09-23-chat-led-redesign.md)

## 担当の読み方

- **Opus** と書いたTaskは、Claude（Opus）がこの計画のコードどおりに実装する。
- **Sol** と書いたTaskは、Codex（`gpt-6-sol`）が実装し、コードレビューもSolが行う。計画はインターフェース・テスト・受入条件を固定し、実装コードはSolが書く。Solへの渡し方は [handoff-chat-led-redesign.md](../../handoff-chat-led-redesign.md) に従う。
- 各Taskの終わりに、Opusが合成HOMEで画面を実際に操作して監修する（UI/UXの受入）。

## Global Constraints

- 無料・有料APIなし・運用サーバーなし。Unharness自体はモデルを呼ばない。
- 画面の普段の表示に、パス・エラーコード・「任意／必須」などの分類語を出さない。出すのは「詳しく」の中だけ。
- 呼び名：零式（TRUEFORM）「何も足さない、素のAI。」／限定解除（UNSEAL）「零式を土台に、選んだ装備だけを解放する。」／通常装備（Normal）「最初に保存した、元の構成。」
- 通常装備は日常の選択肢に並べず、[元に戻す] から使う。
- v1〜v4の保存構成、お気に入り、evidence、退役した機能のデータファイルを書き換え・削除しない。
- 状態は正直に区別する：要求・準備・読み戻し・実タスクでの確認・未確認を混ぜない。確かめていないのに「安全です」「変わっていません」と言わない。
- 画面とチャットのどちらで承認しても、同じ `applyUserPlan` を通る。
- AIがつながっていなくても、画面から [元に戻す] と復旧ができる。
- 開発中の画面を個人の `~/.codex`・`~/.agents/skills`・`~/.claude` へ向けない。検証は合成HOMEで行う。
- 文言は日本語を主、英語を従として `text(ja, en)` で両方書く。

## Review Focus

1. **提案後に設定が変わった**（利用者が提案と承認の間に `AGENTS.md` やSkillを編集した）→ 承認できず「状況が変わりました。AIにもう一度聞いてください」。Task 3のテストで固定する。
2. **チャットと画面で同時に承認した** → 適用は1回だけ、2回目は既存の `duplicate: true` を返し、提案は「適用済み」のまま。Task 3のテストで固定する。
3. **AIが管理Skillや外せないものを外す提案をした** → 提案の作成を拒否し、画面には日常語で理由を出す。Task 3のテストで固定する。
4. **使用量の記録がない**（新規利用者、token記録のないタスク、Claudeの部分的な記録）→ 0やNaNではなく「まだ目安がありません」。Task 5のテストで固定する。
5. **失敗の直後** → 同じエラーが画面に何度も出ず、状態は自動で読み直され、読み直して変化がないと確認できたときだけ「設定は変わっていません」と言う。Task 4のテストで固定する。

---

## 0.1.0（Mac Codex）

### Task 1: 呼び名・一行説明・切替を止める理由・失敗の文言（Opus）

**Files:**
- Modify: `web/src/sources.ts:5-27`（`modePresentation`）
- Modify: `web/src/workbench/ModeCard.tsx:14-15`（カードの状態表示）
- Modify: `web/src/mode-blocker.ts:9-16`（切替を止める理由）
- Modify: `web/src/source-controller-state.ts:93-99`（`failureFeedback`）
- Test: `test/mode-blocker.test.mjs`（追記）
- Test: `test/mode-copy.test.mjs`（新規）

**Interfaces:**
- Consumes: なし
- Produces: `modePresentation[mode].title` は日本語ロケールで `通常装備` / `限定解除` / `零式`、英語ロケールで `Normal` / `UNSEAL` / `TRUEFORM`。`label` は反対側の名前（飾り）。`description` は一行説明。型は変えない（`string`）。

- [ ] **Step 1: 失敗するテストを書く**

`test/mode-copy.test.mjs` を作る：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { modePresentation } from '../web/src/sources.ts';
import { modeBlocker } from '../web/src/mode-blocker.ts';
import { sourceControllerReducer, initialSourceControllerState } from '../web/src/source-controller-state.ts';
import { ApiError } from '../web/src/api.ts';

const internal = ['Normal', '保存待ち', '外部の変更', 'UUID', '操作ID', 'config-', 'source-'];

test('mode names are the concept names with one everyday line each', () => {
  assert.equal(modePresentation.trueform.title, '零式');
  assert.equal(modePresentation.unseal.title, '限定解除');
  assert.equal(modePresentation.normal.title, '通常装備');
  assert.equal(modePresentation.trueform.description, '何も足さない、素のAI。');
  assert.equal(modePresentation.unseal.description, '零式を土台に、選んだ装備だけを解放する。');
  assert.equal(modePresentation.normal.description, '最初に保存した、元の構成。');
});

test('blocked-switch reasons use everyday words', () => {
  const ready = { busy: false, connected: true, confirmed: true, registered: true, conflict: false, recoveryPending: false, setupRequired: false };
  const cases = [{ busy: true }, { connected: false }, { confirmed: false }, { registered: false }, { recoveryPending: true },
    { conflict: true }, { operationUncertain: true }, { setupRequired: true }];
  for (const flags of cases) {
    const message = modeBlocker({ ...ready, ...flags }, 'trueform').message;
    for (const word of internal) assert.ok(!message.includes(word), `${JSON.stringify(flags)}: ${message}`);
  }
});

test('a failed operation shows no raw code in the main sentence', () => {
  const next = sourceControllerReducer(initialSourceControllerState, { type: 'failed', error: new ApiError('config-transform-failed') });
  const [main] = next.error.split('（詳しく：');
  assert.ok(!main.includes('config-transform-failed'));
  assert.ok(!main.includes('外部の変更'));
  assert.ok(next.error.includes('config-transform-failed'), 'the code stays available as detail');
});

test('an uncertain result still forbids pressing again', () => {
  const next = sourceControllerReducer(initialSourceControllerState, { type: 'failed', error: new ApiError('request-failed', undefined, 'uncertain') });
  assert.match(next.error, /もう一度押さず/);
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `node --test test/mode-copy.test.mjs`
Expected: FAIL（`modePresentation.trueform.title` が `'TRUEFORM'`）

- [ ] **Step 3: `modePresentation` を書き換える**

`web/src/sources.ts` の `modePresentation` を次に置き換える：

```ts
export const modePresentation: Record<
  SourceMode,
  { title: string; label: string; description: string; scene: FixtureCase }
> = {
  normal: {
    get title() { return t("通常装備", "Normal"); },
    get label() { return t("Normal", "Saved loadout"); },
    get description() { return t("最初に保存した、元の構成。", "The configuration you saved at the start."); },
    scene: "baseline",
  },
  unseal: {
    get title() { return t("限定解除", "UNSEAL"); },
    get label() { return t("UNSEAL", "Limited release"); },
    get description() { return t("零式を土台に、選んだ装備だけを解放する。", "Starts from TRUEFORM and releases only the gear you choose."); },
    scene: "manual-only",
  },
  trueform: {
    get title() { return t("零式", "TRUEFORM"); },
    get label() { return t("TRUEFORM", "Zero"); },
    get description() { return t("何も足さない、素のAI。", "Nothing added — the AI as it is."); },
    scene: "fixed-only",
  },
};
```

- [ ] **Step 4: カードの状態表示を書き換える**

`web/src/workbench/ModeCard.tsx` の状態表示を次にする：

```tsx
      <span className="mode-card-state">{prepared ? t('次の新しいタスクから、この構成です', 'Used from your next new task')
        : selected ? t('選択中（まだ切り替えていません）', 'Selected — not switched yet') : t('中身を見る', 'See what is inside')}</span>
```

- [ ] **Step 5: 切替を止める理由を書き換える**

`web/src/mode-blocker.ts` の各メッセージを次にする（判定の順番と `kind` は変えない）：

```ts
  if (state.busy) return { kind: 'busy', message: t("処理中です。終わると操作できます。", "Working on it. Controls return when it finishes.") };
  if (!state.connected) return { kind: 'connect', message: t("このMacとつながっていません。「状態を再取得」を押してください。", "Not connected to this Mac. Press Refresh state.") };
  if (!state.confirmed) return { kind: 'refresh', message: t("今の設定をまだ確かめていません。「状態を再取得」を押してください。", "The current settings are not checked yet. Press Refresh state.") };
  if (!state.registered) return { kind: 'initial', message: t("まず初期設定が必要です。チャットで「アンハーネスの初期設定をして」と頼めます。", "Initial setup comes first. Ask your AI: “Set up Unharness.”") };
  if (state.recoveryPending) return { kind: 'recovery', message: t("途中で止まった変更があります。切り替える前に、復旧を確かめてください。", "A change stopped partway. Check recovery before switching.") };
  if (state.conflict && !state.modePlanningAvailable) return { kind: 'changes', message: t("前に保存したときから設定が変わっています。安全のため、切り替えを止めています。", "Settings changed since they were saved, so switching is paused for safety.") };
  if (state.operationUncertain) return { kind: 'operation', message: t("前の操作の結果をまだ確かめていません。もう一度押さずに、「状態を再取得」で確かめてください。", "The previous result is not confirmed yet. Don’t press again — use Refresh state.") };
  if (mode !== 'normal' && state.setupRequired) return { kind: 'settings', message: t("零式と限定解除の中身がまだ決まっていません。チャットで「零式と限定解除のSkill構成を見直して」と頼めます。", "TRUEFORM and UNSEAL are not set up yet. Ask your AI to review them.") };
```

- [ ] **Step 6: 失敗の文言を書き換える**

`web/src/source-controller-state.ts` の `failureFeedback` を次にする。「設定は変わっていません」とはここでは言わない（確かめていないため。Task 4で読み直し後にだけ言う）：

```ts
function failureFeedback(error: unknown) {
  const kind = error instanceof ApiError ? error.kind : "request-failed";
  const message =
    error instanceof ApiError && error.disposition === "uncertain"
      ? t("結果をまだ確かめていません。もう一度押さずに、「状態を再取得」で確かめてください。自動でやり直すことはありません。", "The result is not confirmed yet. Don’t press again — use Refresh state. Nothing is retried automatically.")
      : t(`うまくいきませんでした。「状態を再取得」で今の設定を確かめてください。（詳しく：${kind}）`, `That didn’t work. Use Refresh state to check the current settings. (Details: ${kind})`);
  return { message };
}
```

- [ ] **Step 7: テストを通す**

Run: `node --test test/mode-copy.test.mjs test/mode-blocker.test.mjs`
Expected: PASS

- [ ] **Step 8: 全体の検証**

Run: `npm run check && npm run build && node --test`
Expected: すべてPASS。旧文言を固定しているテストが落ちた場合は、そのテストの期待値を新しい文言へ直す（判定ロジックは変えない）。

- [ ] **Step 9: 画面で確認してcommit**

合成HOMEで `gui --manage-sources` を起動し（[handoff](../../handoff-chat-led-redesign.md) の「合成HOME」）、モードカード・切替を止める理由・失敗表示を375px幅とデスクトップ幅で見る。

```bash
git add web/src/sources.ts web/src/workbench/ModeCard.tsx web/src/mode-blocker.ts web/src/source-controller-state.ts test/mode-copy.test.mjs test/mode-blocker.test.mjs
git commit -m "Use concept names with everyday explanations in the workbench"
```

### Task 2: 管理Skillの判断基準（Opus）

**Files:**
- Modify: `skills/unharness/SKILL.md`
- Modify: `skills/unharness-setup/SKILL.md`
- Test: 既存の `node --test`（distribution / plugin package の検査）

**Interfaces:**
- Consumes: Task 1の呼び名
- Produces: AIが外す／足す候補を選ぶ基準と、利用者への説明の型。Task 3の `propose_change` が入ったら、Step 3で提案の出し方を追記する。

- [ ] **Step 1: `skills/unharness-setup/SKILL.md` に「判断基準」節を追加する**

```markdown
## 外す・足すの判断基準

利用者は非エンジニアを想定する。専門用語を避け、1件ずつ日常語の理由を添える。

- **外す候補（零式）**：作業の進め方を細かく指示する追加指示、特定の手順を毎回強制するSkill、過去のモデルの弱点を補うために書かれたもの。新しいモデルでは不要なことが多い。
- **残す**：Unharnessの管理Skillと接続、プロジェクトの必須条件、権限、メモリ、利用者が「これは仕事の決まり」と言ったもの、必須と任意が混ざった指示。
- **足す候補（限定解除）**：利用者が試したいと言ったSkill、零式で困ったと言われた場面に直接効くもの。一度に足すのは1〜2件にし、効いたかを分かりやすくする。
- 判断に迷うものは外さず、理由と一緒に「迷っています」と伝える。
- 性能が上がると約束しない。「試す」「戻せる」を伝える。
```

- [ ] **Step 2: `skills/unharness/SKILL.md` の説明語を合わせる**

先頭の説明と冒頭節で、モードを「零式（何も足さない、素のAI）」「限定解除（零式を土台に、選んだ装備だけを解放する）」「通常装備（最初に保存した、元の構成）」と書く。利用者への返答では、パス・エラーコード・内部の状態名を出さず、必要なら「詳しく知りたい場合は」と添えて後に回す、と明記する。

- [ ] **Step 3: （Task 3完了後）提案の出し方を追記する**

```markdown
## 提案を出す

外す・足す・戻すを勧めるときは、画面を開かせる前に `propose_change` で提案を作る。
提案には対象ごとの日常語の理由を入れる。利用者が「それでお願い」と言ったら `decide_proposal` で承認する。
画面で承認された提案は、もう一度承認しない。「状況が変わりました」と返ったら、読み直して新しい提案を作る。
```

- [ ] **Step 4: 検証してcommit**

Run: `node --test`
Expected: PASS

```bash
git add skills/unharness/SKILL.md skills/unharness-setup/SKILL.md
git commit -m "Give the management Skill everyday judgment criteria"
```

### Task 3: 提案の記録とMCP操作（Sol）

**Files:**
- Create: `src/proposals/store.mjs`（提案の保存・読み出し・状態遷移）
- Create: `src/proposals/service.mjs`（計画を包む。承認で既存の適用を呼ぶ）
- Modify: `src/sources/session.mjs`（`propose` / `proposals` / `decide-proposal` のaction）
- Modify: `src/ai/tools.mjs`（`propose_change` / `read_proposals` / `decide_proposal`）
- Modify: `src/gui/server.mjs`（`/api/sources/proposals` のread）
- Test: `test/proposals.test.mjs`（新規）

**Interfaces:**
- Consumes: `planUserMode({ workspace, mode, selectedIds })`、`applyUserPlan({ workspace, planId })`、setup の review/apply（`service.SETUP_OPERATIONS`）。
- Produces:
  - `createProposal({ workspace, kind, mode, setupReviewId?, items }) → Proposal`
    - `kind`: `'initial' | 'add' | 'remove' | 'restore'`
    - `mode`: `'normal' | 'unseal' | 'trueform'`
    - `items`: `{ sourceId: string; reason: string /* 1〜200文字の日常語 */ }[]`
  - `listProposals({ workspace }) → Proposal[]`（新しい順、最大20件）
  - `decideProposal({ workspace, proposalId, decision: 'approve' | 'dismiss' }) → Proposal`
  - `Proposal = { proposalId: string /* 64桁hex */; kind; mode; items; setupReviewId: string | null; basis: { revision: number; snapshotId: string }; createdAt: string; status: 'pending' | 'applying' | 'applied' | 'dismissed' | 'stale'; result?: { planId: string; preparedMode; revision; readback } }`
  - 計画（`planId`）は提案の作成時には作らない。承認時に作ってすぐ適用し、`result.planId` に残す（2026-09-23 Solの再現：作成時の計画は、承認時にsetupを適用すると必ず `stale-plan` になるため）。
  - MCP：`propose_change`（write）、`read_proposals`（read）、`decide_proposal`（write, destructive）。入力は zod の strictObject。`reason` は既存の `text(200)` と同じ制約。
  - HTTP：`GET /api/sources/proposals` → `{ proposals: Proposal[] }`、`POST /api/sources/decide-proposal` → `Proposal`

**振る舞い（テストで固定する）:**
1. 作成時は設定を変えない。現在の `revision` と `snapshotId` を `basis` に保存し、`setupReviewId` があれば一緒に保存する。作成時に `setupReviewId` の中身（setup review）が現在のinventoryで有効かを確かめ、無効なら `proposal-invalid` で拒否する。
2. 承認は1回の操作で順に行う：`basis` と現在の状態を比べる → 一致したら状態を `applying` にする → `setupReviewId` があれば既存の setup の apply → `planUserMode({ mode })` → `applyUserPlan({ planId })` → 状態を `applied` にし `result` を保存する。
3. 承認時に `basis` が現在と違う、または途中の既存処理が `stale-plan` / source conflict / setup の不一致を返したら、提案を `stale` にして `proposal-stale` を返す。`basis` の比較で止まった場合は何も書き込まない。setup の適用後に止まった場合は、既存の setup・復旧の仕組みの範囲に留め、通常装備と準備中のモードは変えない。
4. 同じ提案の承認を2回受けたら、2回目は適用しない：`applied` なら1回目の `result` を返し、`applying` なら `proposal-busy` を返す（既存の `duplicate: true` と整合）。
4b. 同じ `mode` の承認待ち提案が既にあれば、新しい提案の作成時に古い方を `stale` にする。
5. `items` に管理Skill（`src/setup/control-sources.mjs` の `requiredControlSources`）や、そのモードで扱えないsourceが入っていたら、作成を `proposal-invalid` で拒否する。
6. 提案の保存は既存のworkspace配下の不変記録と同じ方式（`src/sources/record-file.mjs` の書き方）に従い、既存形式を変えない。

- [ ] **Step 1:** 上の振る舞い1〜6（4bを含む）をそれぞれ `test/proposals.test.mjs` のテストにする。合成workspaceは既存の `test/gui-sources.test.mjs` と同じ作り方を使う。
- [ ] **Step 2:** `node --test test/proposals.test.mjs` で失敗を確認する。
- [ ] **Step 3:** `src/proposals/store.mjs` と `service.mjs` を実装する。
- [ ] **Step 4:** `session.mjs`・`tools.mjs`・`server.mjs` へ配線する。MCPの説明文は「利用者の承認が必要。提案の作成は設定を変えない」と書く。
- [ ] **Step 5:** `node --test` と `npm run check` を通す。
- [ ] **Step 6:** Solがコードレビューし、指摘を反映してcommit・pushする。

### Task 4: 普段の画面（Sol、OpusがUI監修）

**Files:**
- Create: `web/src/workbench/HomeScreen.tsx`（今のモード・提案カード・切替・元に戻す・使用量の目安）
- Create: `web/src/workbench/ProposalCard.tsx`
- Create: `web/src/workbench/SwitchSheet.tsx`（1枚の確認）
- Modify: `web/src/SourceWorkbench.tsx`（普段の表示を `HomeScreen` に差し替え、詳細を「その他」へ）
- Modify: `web/src/WorkbenchNavigation.tsx`（その他：外観・詳しい記録・復旧・設定）
- Modify: `web/src/source-controller-state.ts`（失敗時の二重表示をやめ、失敗後に状態を自動で読み直す）
- Modify: `web/src/workbench.css`
- Test: `web/test/home-screen.test.mjs`（新規。状態→表示の純関数を対象にする）

**Interfaces:**
- Consumes: Task 3の `GET /api/sources/proposals`、`POST /api/sources/decide-proposal`、Task 1の `modePresentation`、既存の `plan` / `apply`。
- Produces: `homeView(state) → { mode: SourceMode | null; proposal: Proposal | null; switchTargets: SourceMode[]; canRestore: boolean; notice: string | null }` を `web/src/workbench/home-view.ts` に置く（テスト対象の純関数）。

**振る舞い（テストで固定する）:**
1. 日常の切替対象は `trueform` と `unseal` だけ。`normal` は `canRestore` の [元に戻す] から使う。
2. カードを押すと `SwitchSheet` が開き、「○○にします。外れるもの n件。次の新しいタスクから」と [切り替える] を示す。[切り替える] で既存の `plan` → `apply` を続けて呼ぶ。表示だけ変わる中間状態を作らない。成功したら「次の新しいタスクから○○です」と既存の [新しいタスクを始める] を示す。
3. 限定解除の保存内容がないときは、限定解除のカードは切替ではなく「AIと足すものを相談」（依頼文のコピー）にする。
4. 失敗時は同じ文言を1か所にだけ出す（`error` と `notice` の二重設定をやめる）。失敗の直後に `state` を自動で1回読み直し、読み直した `revision` と準備モードが失敗前と同じなら「設定は変わっていません」を添える。違えば添えない。操作は [AIに調べてもらう]（状態確認の依頼文のコピー）1つにし、エラーコードは「詳しく」の中に置く。
5. [元に戻す] はMCPやAIに依存せず、ローカルの `plan`（`mode: 'normal'`）→ `apply` で完結する。
6. 375px幅で、今のモード・切替・[元に戻す] が最初の画面に入る。姿はその下。
7. ヘッダーの言語・明暗・演出は1つの設定メニューにまとめる。「その他」では外観を先頭に置く。

- [ ] **Step 1:** 振る舞い1〜5を `home-view.ts` の純関数のテストとして書き、失敗を確認する。
- [ ] **Step 2:** `home-view.ts` と各コンポーネントを実装する。
- [ ] **Step 3:** `npm run check && npm run build && node --test` を通す。
- [ ] **Step 4:** Opusが合成HOMEで、デスクトップ幅と375px幅の4場面を操作して監修する。指摘はSolが反映する。
- [ ] **Step 5:** Solのコードレビュー後にcommit・pushする。

### Task 5: 初回の流れ・使用量の目安・声かけ（Sol）

**Files:**
- Create: `src/proposals/usage.mjs`（モード別の最近7日の目安）
- Create: `web/src/workbench/CheckInCard.tsx`
- Modify: `src/proposals/service.mjs`（`kind: 'initial'` は登録後に使う：setup の review を含む零式の提案として作り、承認で setup の適用 → 零式の適用を行う）
- Modify: `web/src/SourceWorkbench.tsx` の登録画面（パス・実行ファイル・分類語を「詳しく」へ移し、候補を日常語で示す）
- Modify: `web/src/workbench/HomeScreen.tsx`
- Test: `test/proposal-initial.test.mjs`、`test/usage-summary.test.mjs`、`web/test/check-in.test.mjs`

**Interfaces:**
- Consumes: 既存の `registerUserSources`、setup の review/apply、`listRecentUserTasks`、タスクのtoken記録の読み取り（`src/comparisons` の既存関数）。
- Produces:
  - `usageSummary({ workspace, days: 7 }) → { byMode: Record<SourceMode, { tasks: number; perTask: number | null }>; ratioToTrueform: Record<SourceMode, number | null>; availability: 'none' | 'partial' | 'complete' }`
  - `checkInDue({ addedAt, tasksSince, now }) → boolean`（足してから3日、またはタスク5件の早い方）

**振る舞い（テストで固定する）:**
1. 提案はworkspace（登録後に作られる）に保存されるため、登録前にAIは提案を作れない。登録（対象の確認と通常装備の保存）は今までどおりこのMacの画面で利用者が行う。登録画面の普段の表示から、Codex home・プロジェクト・実行ファイルのパス、保存場所、「任意の役割」などの分類語を外して「詳しく」に置き、候補は名前と日常語の説明で示す。宣言のチェックは「これは自分で追加したもので、外しても仕事の決まりには影響しません」の一文にする。
1b. 登録の直後、画面は「AIと零式の中身を決める」へ案内する。AIは `review_setup` で零式の定義を作り、その `setupReviewId` を付けた `kind: 'initial'`・`mode: 'trueform'` の提案を作る。画面の提案カードは [いつもの構成を保存して零式にする] ではなく [零式にする] と表示する（通常装備は保存済みのため）。承認は既存の提案の承認（setup の適用 → 零式の適用）をそのまま使う。途中で失敗した場合は既存の復旧で戻せる。
2. タスクのモードは、そのタスクの開始時刻に準備されていたモードで決める。判定できないタスクは集計しない。
3. token記録のないタスクしかない、またはタスクがない場合は `perTask: null`、画面は「まだ目安がありません」。
4. Claude Codeの記録（合計なし）は、同じアプリ内で同じ基準の値だけを比べる。推定の合計を作らない。アプリをまたいで比べない。
5. 声かけは `checkInDue` が真で、同じ追加について未回答のときだけ出す。[残す] [外す] [AIに相談]。

- [ ] **Step 1:** 振る舞い1・1b・2〜5をテストにし、失敗を確認する。
- [ ] **Step 2:** 実装する。
- [ ] **Step 3:** `npm run check && npm run build && node --test` を通す。
- [ ] **Step 4:** Opusが合成HOMEで、未登録 → 登録 → 零式の提案 → [零式にする]（受入条件1）を操作して監修する。
- [ ] **Step 5:** Solのコードレビュー後にcommit・pushする。

### Task 6: 退役 A（公開サイトからの操作）と B（再実行）（Sol）

**Files（A）:**
- Delete: `src/gui/pairing.mjs`、`src/gui/remote-controller.mjs`、`src/gui/remote-http.mjs`、`src/gui/remote-policy.mjs`、`src/gui/remote-artwork.mjs`、`web/src/PublicWorkbench.tsx`、`web/src/PublicOperationLookup.tsx`、`web/src/LocalConnectionPanel.tsx`、対応する `test/gui-pairing.test.mjs`・`test/gui-remote-*.test.mjs`・`test/ai-public-connection.test.mjs`
- Modify: `src/ai/tools.mjs`（`public_operation_status` 等の公開操作ツールを削除）、`web/src/PublicApp.tsx`（紹介・デモ・導入・更新案内だけ）、`src/gui/server.mjs`

**Files（B）:**
- Delete: `web/src/ReplayWorkbench.tsx`、`web/src/useReplayController.ts`、`web/src/replays.ts`、replay系MCPツール（`prepare_replay`・`open_replay`・`observe_replay`・`read_replay`・`read_replay_result`・`list_replays`・`compare_replays`・`cancel_replay`・`handoff_replay`）、`test/replay-*.test.mjs`
- Modify: `src/experiments/`（replayの操作経路を外す。starting-conditions等、残る機能が使う部分は残す）

**Interfaces:**
- Consumes: なし
- Produces: 退役後も、既存のデータファイル（公開操作のreceipt、replayの記録）を削除・移動しない。

**振る舞い（テストで固定する）:**
1. 残るMCPツールの一覧に、公開操作とreplayのツールがない（`test/ai-server.test.mjs` に一覧の期待値を置く）。
2. 既存のstoreに公開操作のreceiptやreplayの記録があっても、状態の読み取り・切替・復旧が失敗しない（合成storeにファイルを置いたテスト）。
3. 公開サイトのbuildに、pairingや操作UIが含まれない（`npm run build:site` の出力を検査）。

- [ ] **Step 1:** 振る舞い1〜3をテストにし、失敗を確認する。
- [ ] **Step 2:** A → B の順に削除し、その都度 `node --test` を通す。
- [ ] **Step 3:** `npm run check && npm run build && npm run build:site && node --test` を通す。
- [ ] **Step 4:** Solのコードレビュー後にcommit・pushする。公開サイトのdeployはしない（Task 8で利用者の承認後）。

### Task 7: 文書の更新と0.1.0の準備（Opus）

**Files:**
- Modify: `docs/spec.md`、`docs/product.md`、`docs/spec-workbench-ux.md`、`docs/delivery.md`、`docs/status.md`、`docs/compatibility.md`、`README.md`、`README.ja.md`、`docs/README.md`、`AGENTS.md`（順番：Mac Codex → Mac Claude Code → Windows）
- Modify: `skills/unharness/SKILL.md`（Task 2 Step 3）

- [ ] **Step 1:** 仕様書の「採用後に更新する文書」を、実装済みの内容にだけ合わせて更新する（未実装を実装済みと書かない）。
- [ ] **Step 2:** `git diff --check` と `node --test` を通す。
- [ ] **Step 3:** commit・pushする。release・tag・配布ZIPの作成は利用者の承認後に別に行う。

### Task 8: 公開サイトのデモと掲載内容（Opus）

- [ ] **Step 1:** 公開サイトの「AIと進めるデモ」「設定のデモ」を0.1.0の呼び名・流れに合わせる（`web/src/entry/guided-copy.ts`、`web/src/entry/public-modes.ts`）。
- [ ] **Step 2:** `npm run build:site` を通し、ローカルで表示を確認する。
- [ ] **Step 3:** deployは利用者の承認後に行う。
- [ ] **Step 4:** StreetEngineerの掲載文の修正案（再生成・出力比較の表現、Webアプリ表記、Mac＋Codex必須の明示）を利用者へ渡す。掲載の変更は利用者が行う。

## 0.2.0（Mac Claude Code）

0.1.0の完了後に、別の計画 `docs/superpowers/plans/<日付>-mac-claude-code.md` を作る。範囲は仕様書の「Claude Code対応」と受入条件7。既存のClaude adapter（`src/claude/`）と `docs/handoff-claude-macos.md` を出発点にし、提案・画面・使用量の目安が同じ体験で動くことを実機で確認する。
