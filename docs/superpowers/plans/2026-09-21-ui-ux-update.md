# Unharness UI/UX更新 — 現状監査と段階導入計画

> 計画段階。製品コード、依存関係、設定仕様、保存形式、公開接続方式は変更しない。
> 実装時は各Phaseを順番に本人が進める。サブエージェントの大量分担を前提にせず、判断が必要な点はProへ相談する。

**目的:** 既存のUnharnessを保ち、設定モードと内容を理解し、変更を確認して適用できる、使い心地のよいローカルGUIに磨く。

**設計境界:** 表示部品と情報設計を改善する。既存controller・操作ID・context検証・保存/復旧サービスを維持する。新しいAI実行基盤、保存schema、公開接続は作らない。

**現行スタック:** React 19.2.8 / TypeScript 7.0.2 / Vite 8.2.2 / PixiJS 8.20.1 / 独自CSS。

**基準:** 2026-09-21の利用者依頼、[現在の操作仕様](../../spec-workbench-ux.md)、[ローカル入口](../../spec-local-entry.md)、[モード継承](../../spec-mode-inheritance.md)、[v4カスタム指示](../../spec-custom-guidance.md)、[記録UX](../../spec-work-record-ux.md)。依頼と既存仕様が異なる画面構造は、以下を新しい提案として扱う。

## 1. 現状

### 調査した実物と限界

- Git HEADは `cc97c9b`。多数の未コミット変更があり、直近の単純化、モード内容閲覧、記録UX、v4カスタム指示を含む。既存変更を一括で上書き・commitしない。
- 稼働中GUIはloopbackの `#view=mode`。モード、設定、外観、作品制作Dialog、記録/2件比較、接続・復旧を実際に開いて確認した。実際のモード適用、外観の保存/変更、初回登録、更新インストールは行っていない。
- 稼働GUIのmain assetは `index-BlDZvf90.js`、ディスクのbuildは `index-CaJsu16z.js` で不一致。画面で見た挙動を最新ソースの実機検証とみなさない。監査のためのbuild/再起動はしていない。
- 今回のスクリーンショットはブラウザー内で確認した。個人記録名や内部IDを含む画面画像・生の記録はリポジトリへ保存しない。
- 実機の基本幅は536px。比較結果は536pxで横はみ出しなし。全画面・全幅・全状態のキーボード/コントラスト検証は今後のPhaseで行う。
- v4の内容は現ソースと仕様を読んで評価した。稼働中GUIでv4提案の保存・適用を試したという証拠ではない。

### 依頼された10項目

| 項目 | 確認できた現状 | 維持/改善の判断 |
| --- | --- | --- |
| UIライブラリ | Reactと独自HTML部品。shadcn・Tailwind・Base UI・Radix・Motion未導入 | 一括導入せず、部品単位で採用 |
| CSS / Motion | `styles.css` 1117行、`sources.css` 668行、`workbench.css` 81行。暗色固定、色の直書き多数。汎用UIのtransition体系なし | semantic tokensと短いtransitionを先に整理 |
| 共通部品 | ModeActions、ModeContents、LanguageSwitch、CopyRequest、AiRequestButton、PreparedAppearanceOptions、Hangar等。汎用Button/Toast/Tooltip基盤なし | ドメイン部品を残し、下位の共通部品を追加 |
| 画面遷移 | Modes / Settings / Appearance / History / Support。useStateとhiddenで切替。hashは起動時に読むが画面移動で更新されない | controllerを維持しながらナビ・戻る・深いリンクを整理 |
| 状態管理 | reducer、useState、ref、generation/context境界。2.5秒の読取pollで外部MCP変更を追従 | storeライブラリへ載せ替えない。controllerを画面ごとに再生成しない |
| モード切替 | 保存構成の閲覧→plan確認→apply。旧構成の互換経路、競合・不確かな結果・復旧ガードあり | 選択と適用を保ち、確認内容と確定位置を近づける |
| 外観切替 | 独立したAppearanceController、操作receipt、画像の読込・import・保存・selection。Pixiで3姿を描画 | 設定モードと完全に分離したまま共通UIを磨く |
| Dialog / 通知等 | native dialog、details、画面内notice/error、aria-live。作品DialogのEsc終了と起点へのfocus復帰を確認。共通Toastなし | 動くnative dialogはまずwrapper化。重要結果は画面にも残す |
| 重複 | ボタン/余白/見出し、コピーの結果表示、busy/error、local/publicのモード表示、設定編集フォームの装飾 | 見た目と読み上げを共通化。local/publicの権限や処理は混ぜない |
| 破損リスク | 文脈変更、旧review、二重送信、結果不明、画面unmountによるdraft/操作ID消失、CSS reset、Pixi/CSP、v1〜v4/Normal復帰 | 各Phaseに対応する回帰シナリオを持つ |

### 画面をたどった結果

1. **Modes:** 画像、モード選択、保存構成の内訳がある。選択と準備済みは区別できる。一方、件数が多いと確認・確定位置まで長くスクロールする。
2. **Settings:** 初期設定/相談と詳細編集への導線はある。コピーによる依頼とAIの実作業が分かれる点は良い。提案前後の差分を見る専用の構成が弱い。
3. **Appearance:** 3外観と制作/import/collection/cardが一緒に使える。描画の読込中も操作部分がある。作品DialogのEscとfocus復帰は正常。現段階でDialogを全面交換する理由はない。
4. **Compare:** 仕事名から記録を開く、2件を比較する流れが成立。未知のモード、評価者、時間/使用量の限界を残している。比較中は主にボタンの無効化で、処理の段階が分かりにくい。
5. **Support:** 復旧、過去の公開操作照会、旧お気に入りは残っている。通常利用者向け説明と技術用語が混在し、お気に入りがこの画面にあることは見つけにくい。
6. **Home / Updates:** 独立画面はない。更新確認はプラグインMCP側にあり、現行GUI HTTPと直結していない。

## 2. 問題点

優先順位は以下とする。

1. 表示中の候補、保存済み定義、次のタスク用の準備、実際のタスクで観測できた状態を一貫した見せ方にする。`使用中`一語に潰さない。
2. モード確認の要点と確定操作が離れる。長文/多数のSkillを読んでも確定位置を見失わないようにする。
3. 汎用部品・状態表示・色・余白が分散している。現在のdark固定をlight/dark共通の意味ベースの色へ移す必要がある。
4. URLと表示画面が一致しないため、戻る・再開・AIからの画面案内が弱い。共通ナビは必要だが、6つの同格タブを常時出して複雑にしない。
5. `busy`だけでは読み込み/提案確認/適用/結果未確認の違いを伝えられない。内部工程を捏造する進捗バーは採用しない。
6. 比較・外観・設定の巨大フォームを同時に全面改修すると、draftや旧IDの保護を崩す。基盤→1画面ずつの順で移す。
7. 一部のブラウザーテストは環境変数未指定時にskipされる。コード上の期待も旧画面の位置/文言を含む。skipを合格とみなさず、意味のある操作シナリオへ更新する。

## 3. 改善候補と採用方針

### 情報設計

情報の単位は次の6つを維持するが、6つの独立画面・常設メニューを作る意味ではない。普段の開始位置はModes。Homeはその上部の状態概要、Updatesは補助パネルとする。モード/外観の区別をラベルと処理の両方に残す。

| 単位 | 役割 | 初期表示に置かないもの |
| --- | --- | --- |
| Home（概要領域） | Modes上部で対象アプリ、現在の準備、要確認事項、次にできること | 大量の指標、Modesの複製、AIチャットの複製 |
| Modes | Normal / 限定解除 / 零式を選び、保存内容と変更を確認して適用 | 生のconfig、UUID、全履歴の常時表示 |
| Settings | 初期設定、AI相談、保存した構成の見直し、必要時の詳細編集 | 日常画面での大きなAGENTS編集フォーム |
| Appearance | デフォルト / 白銀 / 琥珀、既存作品・制作・import | モード設定や性能による外観のロック |
| Compare | 名前付き記録、1件の振返り、2〜3件の参考比較、別入口の再実行 | 自動順位、未知値の0扱い、勝手な多モード実行 |
| Updates（補助パネル） | この画面/導入物の区別、確認済み更新情報、既存AIへの確認依頼 | 未接続の自動確認、無断更新、未確認の最新版宣言 |

- まず「モード＋その他」を保つ。狭幅で必要な場合のみ「その他」をSheetにする。常設Sidebarは今回必須にせず、入口が増えてメニューでは分かりにくいと確認した場合の候補に留める。見えないアイコンだけのナビにしない。
- Homeの情報はModes上部に集約。記録・比較、外観、設定は「その他」。Updatesは同じ補助領域または実際の更新通知から開く。
- 復旧と接続の情報はSettingsの補助領域にまとめるが、競合・結果不明・中断時はModes/Homeから直接開く。通常の操作経路とは独立した復旧を維持する。
- お気に入りはModesの「保存した構成」に置く。旧版の復帰時は最新モード定義ではなく、その旧版の変更確認を表示する。
- `#view=mode/settings/appearance/history/support` は受け付け続ける。現状のURLと画面の不一致は改善候補だが、router導入・新しいHome/Updatesルートの追加はしない。Phase 3で戻る/直リンクの必要性を確認し、必要なら既存hashの同期だけを行う。その場合も同じcontrollerを維持し、サーバーのorigin/権限を置き換えない。

### Modesの中心体験

- 画像をモード選択の上に置く。選択済みの外観で、表示中の設定モードの姿を描く。
- 各カードは名前、短い説明、保存内容の要点、準備済みかどうか、変更確認へ進むボタンを持つ。カード内のボタンを別のbuttonで包まない。
- `Normal / 限定解除 — UNSEAL / 零式 — TRUEFORM` が設定モード。`デフォルト / 白銀 / 琥珀` はAppearance。
- カード選択はプレビュー。`変更内容を確認`で既存planを取得。確認領域/Sheetに変更点と保持項目を示し、`この内容で適用`で既存applyを一度だけ呼ぶ。
- 確認領域のfooterは長文/狭幅でも到達しやすくする。背景のMode画面と確認領域の二か所に同時に有効な確定ボタンを置かない。
- 正常完了は`次のタスク用に準備できました`。Toastに加え、準備したモードと結果を画面に残す。現在のタスクでの読み込みは別に表示する。
- 既存のplan/context/source conflict判定を使い、独立編集・古いplan・結果不明では確定を止める。保存内容の閲覧まで止めない。

### AI提案・Diff・Approval

- コピーしただけなら`依頼文をコピーしました。AIに送信してください`。実際に提案を受け取る前にThinkingや擬似ログを出さない。
- 既存の`read_setup`、review結果、保存済み本文、提案のSkill states/custom textから、取得できた範囲だけを前後比較する。
- 比較ラベルは`保存済み → 提案`等、証拠に合わせる。現在のファイルを読んでいないのに`現在のファイル → 変更後`としない。
- AGENTS本文は通常テキストとして明示的に開く。変更の追加/削除だけでなく、置換される全体も読める。Skillは名前と状態の前後、保持するものを併記する。
- v4本文8192 UTF-8 bytes、空白のみ/制御文字/不正Unicode拒否、TRUEFORMへの本文流入防止、Normal/旧版復帰の規則を維持する。
- 保存定義の採用（apply_setup）と、モードの準備（apply_plan）は別の確認として扱う。設定保存をモード適用済みと表示しない。
- 外部AIが別の構成を採用した場合は既存pollの更新結果を表示し、手元の旧提案で上書きしない。承認済みの範囲内の再確認を無駄に増やさない。
- **連携の不足:** 既存GUIが取得できるのは保存済み構成と自分でreviewした提案。外部AIが作った未承認reviewを自動で受け取る画面はない。Phase 5前に受け渡し経路を確定する。経路がない場合はコピー案内と既存GUI内の差分確認までを実装範囲とし、AI提案inbox完成とは呼ばない。
- 未承認提案のGUI受信を追加する場合は、既存の固定reviewを読むローカルな受け渡しとして別の小設計を先に確認する。任意のパス、全会話の走査、クラウド送信、自動apply、保存schema変更で代用しない。

### 本当に観測できる処理状態

| 表示 | 根拠 | 禁止する見せ方 |
| --- | --- | --- |
| 設定を確認しています | metadata/state/read要求を実行中 | AIが考えているとの断定 |
| 変更内容を確認しています | plan/review_setupを実行中 | タイマーで進む架空の工程 |
| 確認を待っています | 現在のcontextに有効なreview/planを取得 | 古いreviewに対する承認 |
| 適用処理中です | applyを送信し、結果待ち | 未観測の「書込完了」「検証中」の細分化 |
| 結果を確認しています | 同じ操作の照会/状態の読直しを実行中 | 新しいIDでの自動再送 |
| 準備できました | serviceの確定結果/readback | 演出終了だけによる成功 |
| 結果を確認できません | timeout/disconnect等で処理結果不明 | 失敗/未実行と決めつけて再実行 |
| 変更前に確認が必要です | 競合、復旧待ち、未登録、未対応等の既存結果 | 原因のないグレーアウト |

適用の内部進捗イベントは現行HTTPにない。今回は状態を細分化するための新APIを追加しない。詳細な段階が必要なら、別のサービス契約の設計と承認が先になる。

### Appearanceとlight/dark

- appearanceは既存の選択結果から導く。作品名で判定せず、既存のprepared appearance ID/manifest identityを使う。オリジナル作品は中立のUI treatmentへフォールバックする。
- 構造・余白・操作位置は共通。変える範囲はSurface/Border/Shadow/Accent/Glow/Text emphasis/Motion intensity。
- 色調とlight/darkは別軸。意味のある色（error/warning/success/focus）は外観のアクセントで上書きしない。
- `--background / --foreground / --surface / --border / --muted-foreground / --accent / --focus / --success / --warning / --destructive`を共通化し、既存CSS変数にaliasを設けて徐々に移す。
- light/darkはOS設定とsession内の表示選択から始める。harness config、Normal、作品recordへ新フィールドを追加しない。永続化が必要なら別の表示設定変更として判断する。
- 画像をlight向けに反転したり、外観別に画面を複製しない。画像の暗い舞台と読みやすいUI領域を分ける。

## 4. 採用するUI

| 参照先 | 採用するもの | 導入方法 |
| --- | --- | --- |
| [shadcn/ui](https://ui.shadcn.com/docs) | 所有できる小さな部品、semantic tokens、Button/Dialog/Tabs/Sheet/Tooltip/Dropdown/Toast等の一貫した契約 | 必要部品だけ移植。既存native dialogは当初wrapperで保持。新規の複雑なprimitiveが必要な場合だけ1系統を選ぶ |
| [Beautiful UI](https://beautifului.dev/) | Approval、Diff、Task Rows、Contextの情報構造 | 実データを表示するUXの参考。サンプルのThinking/数値/AI会話は取り込まない |
| [beUI](https://beui.dev/) | 選択indicator、控えめな押下感、必要ならCommand/Panelの挙動 | まず既存CSSで実現。source移植が有利と確認できた箇所だけ採用する |
| [Transitions.dev](https://transitions.dev/) | modal/panel/選択/loading→resultの一貫した方向・時間・終了条件 | CSSの短いtransitionを共有token化。無料の参考例だけで完結できる範囲を採用 |
| 既存Unharness | Pixi、画像、controller、操作receipt、コピーfallback、復旧 | 継続利用。新UIから既存処理を呼ぶ |

shadcnの現行Vite導入手順はTailwindを含む。今回はコマンドをそのまま実行して既存CSSを置換しない。Phase 2でButtonとDialogの小さな比較を行い、(A)既存CSSへ移植する部品所有方式、(B)resetを持ち込まない限定Tailwind方式の影響を比較する。初期推奨はA。単にAPI/トークンを参考にした独自wrapperは「shadcnを丸ごと導入した」と表現しない。

### 依存追加の条件

- 今回はインストールしない。実装時もUIパッケージ一式、Next.jsへの移行、state/routerの一括導入はしない。
- 既存native dialogのfocus/Esc/inertを再実装しない。Tooltip/Dropdown/Sheetで不足があるときのみ、Base UI/Radix等から1系統に限定してサイズ・キーボード・CSP・現UIとの衝突を比較する。
- beUIの例にはMotion/Tailwind等の依存がある。CSSだけで満たせる場合はMotionを追加しない。
- 取り込むコードの版・ライセンス・依存を記録し、既存のthird-party notices生成へ含める。ビルド後のJS/CSS差分と実機の操作待ちを測り、不要な増加は戻す。

## 5. 採用しないUI

- 新しい管理ダッシュボード、常時6つの同格タブ、GUI内の別AIチャット、未取得の思考ログ、架空の進捗率。
- 全画面のshadcn/Tailwind置換、複数primitive系の混在、見た目だけのためのMotion/WebGL追加。
- 通常フォームの液体/磁石/3D tilt、文字の分解、失敗時の大きなshake、派手なtoast積層、必須操作前の長い演出。
- 成功/失敗の唯一の通知を短時間で消えるToastにすること。
- 外観の色だけでerror/successを伝えること、外観別レイアウト、外観選択による設定変更。
- [Rare UI](https://rareui.com/)の常用。Phase 8で象徴的な1箇所を評価できるが、既存Pixiと役割が重なれば不採用のまま完了できる。上限2箇所は目標数ではない。
- バックエンドの進捗・更新・Diff機能を、UIだけで存在するように装うこと。

## 6. 実装順と各Phaseの合格条件

| Phase | 実施すること | 合格条件 |
| --- | --- | --- |
| 1 監査/設計 | 本書、現状の画面/コード、参照5サイト、Proレビューを照合 | 問題/保持条件/採否/担当が明確。製品コード変更なし |
| 2 共通部品 | tokens、Button、native Dialog wrapper、Tabs、Tooltip、通知、Empty/Loading/Error。必要な部品だけ移植 | 表示だけで操作が発火しない。focus/Esc、light/dark、reduced motion、既存CSSとの共存。コピー失敗fallbackが残る |
| 3 Modes | 必要部分だけのShell抽出、ModeCard、近い変更確認、確定、結果、文脈表示、保存版/復旧導線。hash同期は必要性を確認 | 選択だけでapplyしない。別context/古いplanは拒否。成功はreceiptから。画面移動で操作ID/確定待ちを失わない |
| 4 Settings / Appearance | 初期設定/相談/詳細の段階整理。外観3種とlight/darkの共通token、既存制作/import/Dialogを移行 | 誤って再登録しない。外観を変えてもモード不変。画像失敗後も操作可能。v4本文の扱いを維持 |
| 5 AI提案 / Diff / Approval | 既存GUIが受け取れる保存内容/提案を前後表示へ。外部AI未承認提案の受信は先に連携設計を確認。Updatesは利用可能な情報/既存MCPへの導線だけ | コピー≠送信。未取得のbeforeは未取得。v4→TRUEFORMの本文漏れなし。提案変更後に古い承認を使えない |
| 6 Compare | 一覧/1件/2〜3件比較、評価訂正、実行中表示、再実行の分離を共通部品へ | 同じ仕事の評価相談を計測に混ぜない。未知/一部のみを保持。取消/画面移動で保存済み結果を失わない |
| 7 Transition | Dialog/Sheet/Tab/Mode/result/save/update-noticeの時間と方向を統一 | 150〜300ms目安。操作結果を演出待ちにしない。中断/連続操作/非表示/reduced motionで破綻しない |
| 8 Rare候補 | 既存の独自性を確認し、追加効果を0〜1箇所で比較 | 意味の理解が改善しなければ採用しない。通常フォームへの拡大なし |
| 9 狭幅/アクセシビリティ | 390px、現実の536px side-pane、広幅、200% zoom、keyboard、screen reader、6配色 | 主要CTA到達、focusが見える、Dialog復帰、未知値の可読性。全体横overflowなし。必要な表の局所scrollは説明付き |
| 10 回帰 | 対象自動テスト＋build＋所有fixtureの一巡＋必要な実機受入 | v1〜v4/Normal/お気に入り/中断復旧/重複ID/遅延応答/旧公開receiptが保持。skipと実施済みを分けて報告 |

アクセシビリティとlight/darkの契約はPhase 2から適用し、Phase 9を初めて対応する段階にしない。各Phaseの後に対象の回帰確認を行い、Phase 10まで保護を先送りしない。

### Transitionの具体的な方針

- Button/選択indicator: 150ms、opacity/小さなtransform。押下で位置が大きく逃げない。
- Dialog/Sheet/panel: 180〜220ms。closeはopenと同等か短く。focusの移動/復帰をanimation完了に依存させない。
- Tab/内容更新: 150〜180ms。先に必要な内容と読み上げを更新し、画面ごとのcontrollerをunmountしない。
- loading→success/error: 180〜220ms。error・結果不明は持続する表示を残す。
- reduced motion/演出off: transform、blur、連続pulseを止める。静的な差分・ラベル・結果は同じ。
- Pixiの変身は別の視覚timeline（現コードでは距離に応じ約0.55〜3.4秒）。UIの150〜300msを機械的に当てて既存poseを壊さない。設定の完了や操作解禁をその終端まで待たせない。

### 回帰で重点確認するケース

1. review表示中に独立編集/登録scope変更/MCPによる別モード準備が入る。旧planを適用しない。
2. 適用の返信が消える。未実行と決めつけず、元の操作IDで結果を確認する。
3. Dialog/ページを閉じても受理済みの処理・reviewId・draftを意図せず破棄/二重送信しない。
4. v1/v2/v3のお気に入り、v4 custom本文、Normal、途中復旧を新表示が別の意味へ読み替えない。
5. 画像decode/CSP/graphicsが失敗しても設定と復旧を操作できる。
6. Compareのpartial/null/同一タスクの訂正版をゼロや独立試行に変えない。
7. 3外観×light/darkで意味色・focus・フォーム・確認Dialogを検証する。MacのCmd系とWindowsのCtrl系、ホストアプリの予約shortcutとの衝突も確認する。

Command Paletteは画面内の明示ボタンを先に置く。Cmd/Ctrl+Kをホストアプリより優先する実装はせず、利用できるshortcutを実際の埋込ブラウザーで確認してから追加する。

## 7. 変更予定ファイル

以下は実装を承認された後の予定であり、現時点で新しいTSX/CSSファイルは作成しない。

| 領域 | 主な既存ファイル | 新規候補と責務 |
| --- | --- | --- |
| 共通UI | `web/src/styles.css`, `sources.css`, `workbench.css`, `LanguageSwitch.tsx` | `web/src/ui/Button.tsx`, `Dialog.tsx`, `Tabs.tsx`, `Tooltip.tsx`, `DropdownMenu.tsx`, `Sheet.tsx`, `Toast.tsx`, `tokens.css`, `motion.css` |
| Shell / ナビ | `SourceWorkbench.tsx`, `WorkbenchNavigation.tsx` | `web/src/workbench/WorkbenchShell.tsx`, `StatusOverview.tsx`, `ContextSummary.tsx`。controllerは親に維持 |
| Modes | `ModeContents.tsx`, `ModeActions.tsx`, `mode-blocker.ts`, `mode-contents.css`, `components/PreparedState.tsx` | `web/src/workbench/ModeCard.tsx`, `OperationStatus.tsx`, `RestorePanel.tsx` |
| Settings / Diff | `SetupHandoff.tsx`, `SourceStateEditor.tsx`, `SavedSetupSummary.tsx`, `EnrollmentPanel.tsx`, `PluginEnrollmentPanel.tsx`, `setup.ts` | `web/src/workbench/SettingsPage.tsx`, `ProposalReview.tsx`, `SourceDiff.tsx`。既存payloadを表示 |
| 外観 | `AppearancePanel.tsx`, `PreparedAppearanceOptions.tsx`, `prepared-appearances.ts`, `useLocalAppearance.ts`, `artwork.css` | `web/src/ui/appearance-tokens.ts`。既存ID/manifestから表示だけを導く |
| 記録/比較 | `ComparisonWorkbench.tsx`, `RecentTaskPicker.tsx`, `StartingConditions.tsx`, `ReplayWorkbench.tsx`, `work-records.css` | 記録カード/結果表示の抽出。新しい保存処理は追加しない |
| 更新/依頼 | `AiRequestButton.tsx`, `entry/CopyRequest.tsx`, `useSourceController.ts` | `web/src/workbench/UpdateInfoPanel.tsx`。GUI版と導入物を区別し、既存MCPへの確認導線を置く |
| controller | `useSourceController.ts`, `source-controller-state.ts`, `useComparisonController.ts`, `useAppearanceController.ts`, `useReplayController.ts`, `source-operations.ts`, `api.ts` | 原則維持。必要な変更はUI状態の観測/投影のみ。ID・request・retry契約を変更しない |
| テスト | `test/web-workbench-ux.test.mjs`, `web-setup.test.mjs`, `web-setup-inheritance.test.mjs`, `web-source-state-v3.test.mjs`, `web-custom-guidance.test.mjs`, `web-comparisons.test.mjs`, `web-replays.test.mjs`, `web-prepared-appearances.test.mjs`, `web-ai-updates.test.mjs`, `web-retained-settings.test.mjs`, `test-support/workbench-navigation.mjs` | `test/web-ui-primitives.test.mjs`, `web-operation-feedback.test.mjs`, `web-theme-accessibility.test.mjs`を必要な振る舞いの検証に使用 |
| 基本変更禁止 | `src/sources/*`, `src/setup/*`, `src/apps/*`, `src/appearances/*`, `src/gui/remote-*`, `.codex-plugin/*` | このUI計画の便宜で保存schema、権限、公開接続、アダプターの動作を変えない |

部品の責務は表示とUIイベントに限定する。`SourcePlan`/`SourceView`/`ArtworkPort`/既存receiptを受け取り、所有controllerの関数へ渡す。視覚部品が直接ファイル、MCP、任意URLへアクセスしない。

検証は既存の `npm run check`、`npm run build`、対象Node/browserテストを使い、公開側と共有部品が変わる場合は `npm run build:site` とlegacy公開UIの回帰も含める。正式な配布/実機受入は、この計画の完了と別の証拠を記録する。

## Proとの相談結果と採用した修正

[既存の製品設計相談](https://chatgpt.com/c/6aa79e93-202c-83e8-b3ea-2c4e659a802e)で、今回の監査結果・指定5サイト・制約・10段階の案を6 Proへ提示し、完了した回答を確認した。コードや個人設定本文は送信していない。

- 6情報単位と6常設入口を分ける。HomeをModes上部へ、Updatesを補助パネルへ寄せ、常設Sidebarを必須から外した。
- 状態/入力/操作IDが画面移動で残る条件を明文化。SourceWorkbenchの全面分割やdetails総置換を目的化しない。
- shadcnを既存CSSへ適応した部分は自前保守と明記し、無修正導入と称さない。native dialogを活かす。
- 未取得の内部工程・AI思考は表示しない。未承認AI提案の取得経路がない場合は、コピー案内の改善と既存提案の差分表示までに限定する。
- keyboard/light-dark/reduced motionと回帰確認をPhase 2から始め、Phase 9/10へ先送りしない。

公開ページは利用者の指定により別のSolタスクへ引き継いだ。この計画はローカルGUIの監査・設計だけであり、公開ページ実装、新配布物公開、個人プラグイン更新を同時に行わない。

## 参照した一次資料

- [shadcn/uiの方針](https://ui.shadcn.com/docs)、[Viteへの導入](https://ui.shadcn.com/docs/installation/vite)、[theme tokens](https://ui.shadcn.com/docs/theming)、[Dialog](https://ui.shadcn.com/docs/components/base/dialog)。手順が既存CSSの置換を含むことは、今回そのまま実行する理由にならない。
- [Beautiful UI](https://beautifului.dev/)。利用者が指定したTurboのAI-native UIを参照。同名の別リポジトリとは区別した。
- [beUI](https://beui.dev/)、[公式source repository](https://github.com/starc007/ui-components)、[Command Palette](https://beui.dev/components/blocks/command-palette)。Motion/Tailwind依存と所有コード方式を確認。
- [Rare UI](https://rareui.com/)。利用者の回答でこのURLを確定。rareui.inとは別。
- [Transitions.dev](https://transitions.dev/)、[公式のreview/refine説明](https://transitions.dev/skill.html)。ライブラリを大量追加するのではなく、既存遷移の整理として使う。
