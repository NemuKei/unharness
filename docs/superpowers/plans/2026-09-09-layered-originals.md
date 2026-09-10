# 自由なレイヤー式ドット絵 実装計画

> **For agentic workers:** Use `superpowers:executing-plans` task by task in the existing task. Preserve the current unfinished appearance changes and retain all historical records. Additional agents are not required.

**Goal:** AI本体・拘束具・背景をテンプレートに沿って自由に作成・読み込み・組合せできる外観コレクションを作る。

**Architecture:** テンプレートと検証可能な画像データを共通コアが管理し、PixiJSが合成と既知の動きを担当する。同梱の制作Skillは利用者のAIとの相談・素材制作・プレビューを担当する。見た目の選択と性能評価は独立し、制作に比較成績を要求しない。

**Tech Stack:** Node.js 24+、既存のローカル保存・復旧、PNGとバージョン付きJSON、React / TypeScript / PixiJS。任意の画像生成は利用者自身のAI環境を使う。

**Spec:** [外観の契約](../../personalization.md)、[描画方針](../../design.md)、[統合計画](2026-09-09-mac-product-experience.md)。旧[外観インターフェース計画](2026-09-09-appearance-interface.md)の作成資格・BAD強制・3候補固定の部分を置き換える。

## 共通条件

- オリジナルの作成・修正・再選択はいつでも任意。性能比較、特定モード、3候補、最終選択による解放制限を設けない。
- 画像を選んでもハーネス設定と比較の成績を変えない。悪化した比較でも作品を使える。評価は別の数値・説明で示す。
- 作品・以前の版・旧候補・過去の比較記録を消さない。壊れた保存状態を新しいランダム生成の許可としない。
- 起動、標準素材の表示、合成、保存、読み込み、カード出力はモデル呼び出し不要。任意のAI制作に使う利用枠は別に扱う。
- 読み込むものは画像と検証済みのデータ。生成されたJavaScript、HTML、シェーダー、外部URLを作品として実行しない。

## タスク1: 3つの論理パーツと互換テンプレート

**ファイル:** 新規`src/appearances/template.mjs`・`assets/appearance-templates/hangar-layered-v1/`、参照`web/src/scene-parts.ts`・`web/src/scene-cels.ts`・`web/src/scene-rig.ts`、テスト`test/appearance-template.test.mjs`。

**新しい境界:** `validateLayeredAppearance(manifest, template)`は3役割、参照素材、テンプレート版、位置、既知の可動部と描画順を検証する。`resolveAppearanceLayers(manifest, template, mode)`は実行コードを持たない描画用データを返す。`mode`は`normal | unseal | trueform`で、性能の評価値を入力にしない。

| 論理パーツ | 制作・差替え | テンプレートが決めるもの |
| --- | --- | --- |
| AI本体 | 生き物・精霊・機械・抽象体など、本人が選ぶイメージ | 基準位置、寸法、拘束具との収まり、前後関係 |
| 拘束具 | 外装・枠・支持部・鎖など | 可動部の分割、支点、開く方向、Normal / UNSEAL / TRUEFORMの位置 |
| 背景 | 格納庫や任意の背景 | 共通キャンバス、固定位置、前景を見分ける範囲 |

- [x] 現行の`WORLD = 724`と既存の本体・装甲・支持部の座標を確認し、最初の`hangar-layered-v1`を共通の724×724座標で定義する。全パーツを同じ座標へ揃え、利用者が手作業で位置合わせする必要を減らす。
- [x] AI本体・拘束具の透明PNGと背景、ガイド画像、テンプレートの版、アンカー、安全な表示範囲、パーツ名、前後関係を用意する。論理パーツは3種類のまま、拘束具は既存の可動部に合う複数画像へ分割できるようにする。
- [x] Normalでは覆う、UNSEALでは一部を開く、TRUEFORMでは本体を解放する同一テンプレートを使う。任意画像から未定義の開閉アニメーションを推測しない。
- [x] 本体だけを作り替え、拘束具と背景は標準パーツを使えるmanifestを定義する。標準素材も版と内容IDで参照し、将来の素材更新で旧作品を変えない。
- [x] テンプレート版の不一致、重複パーツ、未知の可動部、画像の欠落、外部URL、任意スクリプトを拒否するテストを先に作る。

```js
for (const mode of ['normal', 'unseal', 'trueform']) {
  const layers = resolveAppearanceLayers(manifest, template, mode);
  assert.equal(layers.entity.assetId, manifest.layers.entity.assetId);
  assert.equal(layers.background.assetId, manifest.layers.background.assetId);
  assert.equal(layers.mode, mode);
}
assert.throws(() => validateLayeredAppearance(
  { ...manifest, script: 'change-settings()' }, template
));
```

`manifest`と`template`は同じテストファイルで作る最小の3役割fixtureを使う。本体・背景は同じ画像IDを保ち、拘束具だけがモードの決められた位置へ動くことも検査する。

- [x] `node --test test/appearance-template.test.mjs`を実行し、テンプレートから作った3モードの合成ガイドを実際に確認する。導入者向けに実行コードを渡す仕様にしない。

## タスク2: ローカル画像の検証・保存と自由な選択

**ファイル:** 新規`src/appearances/assets.mjs`・`src/appearances/import.mjs`、変更`src/appearances/lifecycle.mjs`・`src/appearances/store.mjs`・`src/appearances/service.mjs`・`src/appearances/view.mjs`、テスト`test/appearance-import.test.mjs`・`test/appearance-lifecycle.test.mjs`・`test/appearance-store.test.mjs`・`test/appearance-evidence.test.mjs`。

**境界:** `reviewAppearanceImport({ workspace, manifest, files })`は明示的に選択した画像とテンプレートを検証し、レビューIDとプレビュー情報を返す。`saveAppearanceImport({ workspace, reviewId, expectedStateId })`がローカルの作品版を保存する。任意パスではなくアップロードしたバイト列、またはローカル管理経路が発行した制作場所内のファイルを扱う。

- [ ] 最初は静止PNGを受け付け、形式・完全なデコード・寸法・ファイル数・総容量を検証する。1ファイル8 MiB、1セット64 MiB、64画像以内を入力上限とし、巨大画像・壊れたPNG・想定外のアニメーションPNGを拒否する。
- [ ] 画像の正規化は検証済みのデコーダーを用い、元ファイルを残してローカルのコピーへ行う。不要なEXIFやテキスト情報は保存用コピーへ引き継がない。依存物は既存実装を調べ、必要な場合だけ固定する。
- [ ] バイト列はローカルの専用資産保管に内容IDで保存し、manifestにはIDと寸法・版を記録する。既存JSONレコードの1 MiB制限を全体で緩めない。画像と索引の中断・競合・欠損を検査する。
- [ ] 旧appearance state・候補・作品の読み取りを残し、新しい形式への移行を変更できない版として保存する。現行の比較資格チェックを自由な作成・読み込み・表示の入口から外す。
- [ ] 比較が悪化、未判定、訂正された場合も同じ作品を表示できるテストを追加する。旧比較の条件判定は比較機能として保ち、見た目を強制する根拠にしない。
- [ ] 同一の保存操作の再送は同じ結果を返す。新しい制作・修正の明示依頼は新しい作品版として扱い、以前の版を再選択できるようにする。
- [ ] `node --test test/appearance-import.test.mjs test/appearance-lifecycle.test.mjs test/appearance-store.test.mjs test/appearance-evidence.test.mjs`を実行し、独立編集・中断からの復旧と旧作品の保持を確認する。

## タスク3: 自分のAIと作る同梱Skill

**ファイル:** 新規`skills/unharness-original/SKILL.md`、必要なアプリ別メタデータと`references/layer-template.md`、ガイド生成の共通処理は`src/appearances/`へ置く。テスト`test/appearance-authoring.test.mjs`。

- [ ] 開始時に、何を作りたいか、参考画像、雰囲気・色、作り替えたいパーツを確認する。既に明示された希望を繰り返し聞かない。思いつかない場合は少数の方向を提案し、3候補を強制しない。
- [ ] 本体だけ・拘束具だけ・背景だけ・一式の制作を選べるようにする。指定していないパーツは利用者が選んだ既存素材を使う。
- [ ] テンプレートとガイドをAIへ渡し、各レイヤーを分けた素材を制作する。一枚に合成した完成見本だけを、編集可能なパーツ完成として扱わない。
- [ ] 利用可能な画像生成機能を確認して使う。画像モデルがない環境では、対応するピクセルデータや描画コードによる制作、または本人の画像を使う経路を案内する。追加の有料APIやアカウントを前提にしない。
- [ ] 3モードの合成プレビューを見せ、修正の相談を続けられるようにする。生成・描画コードは制作の補助に限定し、作品として実行しない。
- [ ] 利用者が選んだパーツをローカルの制作場所へ保存し、GUIの「作品を読み込む」または検証済みのローカル操作へ渡す。ボタンからの自動送信が未対応なら相談文のコピーを使い、送信済みと表示しない。
- [ ] CodexとClaude Codeそれぞれで実際の制作・プレビュー・読込手順を確認する。AIの利用量は制作側に記録し、ハーネス比較の試行使用量へ混ぜない。
- [ ] Skillの構造検査と`node --test test/appearance-authoring.test.mjs`を行い、実際に生成した素材を目視確認する。既存の全アカウントに同じ画像生成機能があると保証しない。

## タスク4: 合成表示・作成ボタン・コレクション

**ファイル:** `web/src/Hangar.tsx`・`web/src/renderer.ts`・`web/src/scene-rig.ts`・`web/src/appearances.ts`・`web/src/useAppearanceController.ts`・`web/src/SourceWorkbench.tsx`、新規`web/src/AppearancePanel.tsx`・`web/src/appearance-layers.ts`、既存`src/sources/session.mjs`・`src/ai/tools.mjs`、テスト`test/web-appearances.test.mjs`・`test/appearance-entrypoints.test.mjs`。

- [ ] 「オリジナルイメージを作成」「作品を読み込む」「コレクション」を小さな外観領域に置く。比較の成績によって作成ボタンを隠さない。保存には正常なローカル接続が必要であることを説明する。
- [ ] 作成ボタンから同梱Skillへの相談文を用意する。読み込みは本体・拘束具・背景のプレビューと置換する対象を確認してから保存する。
- [ ] 公開UIから画像を扱うときも、保存先はローカルの画像APIに固定する。設定・メモリ・会話の本文をアップロード経路へ混ぜない。
- [ ] 画像は認証された経路で取得して表示し、不要になった一時URLとテクスチャを解放する。コレクションは必要なページの静止サムネイルを使い、一覧の各項目でアニメーションを起動しない。合成PNGの保存でcanvasの読み出しが拒否されるケースも検証する。
- [ ] 背景→背面の拘束具→本体→前面の拘束具という既知の描画順を使い、3論理パーツとして操作できるようにする。パーツ未変更時は既存の受入れ済み機構と49姿勢を維持する。
- [ ] 任意の画像の輪郭から関節や立体的な動きを推測しない。対応するテンプレートのアンカーと可動部だけを動かす。互換性がない素材はプレビュー段階で説明する。
- [ ] 選択した作品と部品の版を再起動後も保持し、以前の作品へ戻れるようにする。性能評価は別のHTMLの表示とし、作品をGOOD/BADへ変更しない。
- [ ] 演出OFF・低減モーションでは3モードの静止姿勢を表示する。本体や背景の崩れ、隠れたタブの動作、メモリ使用、画像欠損、キーボード操作を確認する。
- [ ] `npm run check`、`npm run build`、`node --test test/web-appearances.test.mjs test/appearance-entrypoints.test.mjs test/web-ai-updates.test.mjs`を実行する。大きい画面・狭い画面と各AIのアプリ内ブラウザーで、本体のみ交換と一式交換を確認する。

## タスク5: 共有へ備える境界

**ファイル:** [共有仕様](../../build-cards.md)、作品manifestの公開可能な表示名・作者・版の定義、将来のテスト`test/appearance-export.test.mjs`。

- [ ] ローカルの合成PNGと、比較欄を付けない外観カードを出力できる形で描画を分離する。作者リンクを確認でき、画像の見た目が性能評価を決めないようにする。
- [ ] 後続で検討する作品パックでは、画像・テンプレート版・配置・作者情報・利用条件を扱える構造にする。今の段階で公開ギャラリーや外部保存サービスは実装しない。
- [ ] 作品共有から個人のハーネス設定、記憶、会話、ローカルパス、秘密情報が除かれることを検査できるようにする。生の制作会話は作品の必須データにしない。
- [ ] 共有用パックの具体的な形式・互換性・配布先は、ローカルでの作成と再利用が動いた後に利用者と決める。自動投稿を追加しない。
