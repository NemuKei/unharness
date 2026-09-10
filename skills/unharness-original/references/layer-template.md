# hangar-layered-v1 制作参照

## 素材の読み方

このファイルからの相対参照は同梱レイアウト用。現在の作業場所やユーザー名からパッケージ位置を推測しない。[template.json](../../../assets/appearance-templates/hangar-layered-v1/template.json)を構造の正本、[stock.json](../../../assets/appearance-templates/hangar-layered-v1/stock.json)を標準部品と内容IDの対応表として読む。いずれも読取専用。参照が解決できない、または版が異なる場合は推測して続行しない。利用者またはローカル管理画面から、正しい版の素材一式を提供してもらう。

選択済みの作品がある場合、その正確な部品と版を保持する。標準素材の最新ファイルへ勝手に差し替えない。下記の標準素材は、既存選択がない場合の基準である。

## 固定値

下記は構造テスト用の要約で、取り込み用manifestではない。templateId・rendererVersion・固定アンカーは変えない。部品名を増やさない。49姿勢の内容や追加の関節を推測しない。不一致を見つけたら親側のテンプレート更新として扱い、制作側で数字を変更して整合したことにしない。

```json
{
  "name": "hangar-layered-v1",
  "templateId": "ee9c5889d4a44c4258b3bdc21bc963ed4f8b28cbbcd49718fcf4f792c435975c",
  "rendererVersion": "mechanical-layers/v1",
  "canvas": { "width": 724, "height": 724 },
  "entityAnchor": { "x": 362, "y": 330 },
  "entityBounds": { "x": 216, "y": 48, "width": 292, "height": 527 },
  "poseCount": 49,
  "modePoseIndices": { "normal": 0, "unseal": 24, "trueform": 48 },
  "input": {
    "format": "static-png", "square": true, "maxSide": 2048,
    "maxImageBytes": 8388608, "maxSetBytes": 67108864, "maxImages": 64
  }
}
```

全ての部品は左上を(0,0)とする共通キャンバスを使う。本体の基準点(362,330)と表示範囲(216,48,292,527)はデザインの収まりを判断する基準で、画像の切抜き寸法ではない。元PNGの透明余白を保つ。大きい画像の作画時は全座標を一律の比率で扱い、部品だけを別々に中央寄せしない。

入力は静止PNG、正方形最大2048px、8MiB/画像、64MiB/セット、64画像。保存コピーは724×724へ正規化され、元画像は残す。容量確認はバイト単位。APNG、JPEG、WebP、動画や壊れたPNGをPNGという拡張子だけで渡さない。形式変換が必要なら、元を残した制作コピーを作り、再確認する。SVGは参照専用で、作品の読込画像ではない。JavaScript、HTML、シェーダー、外部URL、制作補助コードを作品として取り込まない。

## 部品と素材

3つの論理役割はentity／restraints／background。13画像全てを毎回作るという意味ではない。拘束具は6本のarm、4枚のpanel、glintの11部品に分かれる。個別に変更し、残りを保持できる。描画順は `background → rear-restraints → entity → front-restraints`。全てのPNGは724×724の同じ座標を保つ。

| partId | 役割／前後 | 同梱素材 |
| --- | --- | --- |
| `background` | 背景 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/background.png) |
| `arm-left-upper` | 拘束具／背面 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/arm-left-upper.png) |
| `arm-left-middle` | 拘束具／背面 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/arm-left-middle.png) |
| `arm-left-lower` | 拘束具／背面 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/arm-left-lower.png) |
| `arm-right-upper` | 拘束具／背面 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/arm-right-upper.png) |
| `arm-right-middle` | 拘束具／背面 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/arm-right-middle.png) |
| `arm-right-lower` | 拘束具／背面 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/arm-right-lower.png) |
| `entity` | 本体 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/entity.png) |
| `panel-upper-left` | 拘束具／前面 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/panel-upper-left.png) |
| `panel-upper-right` | 拘束具／前面 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/panel-upper-right.png) |
| `panel-lower-left` | 拘束具／前面 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/panel-lower-left.png) |
| `panel-lower-right` | 拘束具／前面 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/panel-lower-right.png) |
| `glint` | 拘束具／前面の発光 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/glint.png) |

各画像にはその部品だけを描く。本体・拘束具の部品外は透明、背景は背景だけ。armのpivot・mask・solid、panelのpoints、glintのboundsと姿勢ごとの値はtemplate.jsonから読む。特に三角panelを独自の長方形画像として拡縮したり、鎖というデザイン名から新しい関節を作ったりしない。glintを恒常的な文字表示として使わない。

## ガイドとプレビュー

| 対象 | 画像ガイド | 座標を読むガイド |
| --- | --- | --- |
| 全体 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/guide-all.png) | [SVG](../../../assets/appearance-templates/hangar-layered-v1/guide-all.svg) |
| 本体 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/guide-entity.png) | [SVG](../../../assets/appearance-templates/hangar-layered-v1/guide-entity.svg) |
| 拘束具 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/guide-restraints.png) | [SVG](../../../assets/appearance-templates/hangar-layered-v1/guide-restraints.svg) |
| 背景 | [PNG](../../../assets/appearance-templates/hangar-layered-v1/guide-background.png) | [SVG](../../../assets/appearance-templates/hangar-layered-v1/guide-background.svg) |

標準の見え方は[Normal](../../../assets/appearance-templates/hangar-layered-v1/preview-normal.png)、[UNSEAL](../../../assets/appearance-templates/hangar-layered-v1/preview-unseal.png)、[TRUEFORM](../../../assets/appearance-templates/hangar-layered-v1/preview-trueform.png)を参照する。標準素材のプレビューは新作の合成確認の証拠ではない。ガイド線・文字も作品PNGには含めない。

新作の確認では、置換PNGと保持する部品を同じtemplateIdの姿勢0／24／48で合成する。本体・背景の画像IDは同じで、姿勢には本体の既知の表示値も含まれる。既存の動きを別の静止画3枚で置き換えない。Normalで覆われ、UNSEALで一部が開き、TRUEFORMで解放されることを目視する。各姿勢の接点・欠け・意図しない重なり・背景に埋もれる箇所を確認する。

既存の合成手段が使えなければ、制作コピーへのガイド重ね合わせは可能でも、正確な3モード合成は未検証とする。PNGを残してローカルGUIの検証を待つ。一枚絵しか生成できない場合も、分離できた実ファイルだけを成果とし、分離済みと装わない。

## 制作場所からの引き渡し

利用者が選んだ制作場所の新しい版に、置換用PNGだけをまとめる。`entity.png`などのpartId対応名は案内のためで、ファイル名だけで自動保存を許可するものではない。元画像、任意の制作補助コード、3モードの見本は読込対象とは分離する。

引き渡しには「このテンプレート版」「変更したpartIdとPNG」「保持する部品と確認できた版」「実測した寸法・容量」「プレビューの確認範囲」を添える。未知の内容IDを作らない。保持する素材のIDや利用者のファイルを、架空のmanifestとして提出しない。GUIが対応部品と保存コピーをレビューし、認証したローカル保管へ保存する。

読込・保存操作がまだなければ、その不足とPNGの所在だけを伝える。制作許可は公開・投稿や、設定／会話本文のアップロード許可ではない。公開ページへそれらを送らず、ブラウザー保存領域やURLに認証情報を置かない。

## 統合と未確認範囲

このSkillは制作手順と参考情報のみ。同梱素材への参照を保つ配布レイアウト、manifestへの追加、GUIの明示的ファイル選択・レビュー・保存・コレクションは親側で統合する。これらの呼出しが既に提供されていると仮定しない。既存の管理Skillや公開4操作へimport機能を追加しない。

Codexはagents/openai.yamlの明示呼出しポリシー、Claude CodeはSKILL.mdのdisable-model-invocationを用意している。アプリ内での表示名・呼出し名は実際の導入状態を確認する。別アプリへ勝手に会話を移したり、サブエージェントを作る手順はない。Codex／Claude Codeそれぞれの画像生成・プレビュー・読込・保存の実機一周は未確認。構造・契約テストは、AIの実際の挙動を証明するものではない。

| 手動確認シナリオ（実機合格の記録ではない） | 期待する案内 |
| --- | --- |
| 本体だけ・色や希望が記入済み | 聞き直さず本体だけ制作し、選択済み拘束具・背景を保持 |
| 画像生成機能がない | 利用者の画像またはローカル描画を提案。新規有料APIは不要 |
| 比較が悪化・未判定 | 新規制作と修正を許し、比較やNormalを変更しない |
| テンプレートが欠落、姿勢が不一致 | 正しい素材を求め、推測した完成を報告しない |
| 合成見本だけ、または規格外画像 | 別PNGの不足・変換と確認待ちを説明。保存済みにしない |
| GUI読込未提供、または保存応答不明 | PNGを保持し、直接保管庫を書き換えず、確認可能な同じ操作結果を調べる |

メタデータの根拠（2026-09-10確認）：[OpenAIのSkillガイド](https://learn.chatgpt.com/docs/build-skills)、[Claude CodeのSkillガイド](https://code.claude.com/docs/en/skills)。記述の存在と、この同梱版のネイティブ動作確認は別である。
