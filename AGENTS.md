# AGENTS.md

ユーザー追加のAI指示/Skill/hook設定を比較・保存・復旧するローカル製品。macOS/WindowsとCodex/Claudeは別々に適合を検証する。

- 無料で使え、有料API/hosted backend/継続運営費を必須にしない。通常の構成/保存/import/exportはモデル呼出しなし。任意の制作はユーザー自身のAI環境を使う。
- 製品/モード/保存契約はdocs/product.md、docs/spec.md、docs/spec-mode-inheritance.md。GUIとlocal MCPは同じ決定的操作を使い、記録/画像/設定はlocalに置く。
- ユーザー追加の任意設定だけを対象とし、project要件・provider/managed policy・memory・native continuityを保持する。ユーザーディレクトリ配置だけで所有/削除可能と判定しない。
- 全モードで製品管理/起動/状態/復旧経路を保持する。要求mode、準備済み設定、観測runtime、不明を区別し、検証できないとき適用済みと表示しない。
- Normal、favorite、旧version、旧記録を再解釈/上書きしない。独立編集があれば復旧前に確認する。外観選択は設定や評価結果を変えない。
- 実設定書込はdocs/spec-user-sources.mdの適合範囲と復旧/競合契約に従う。設定ファイル内容をinventory中に実行しない。
- credential、個人設定backup、memory、raw chat、実ユーザー実験dataをGitへ入れない。軽いハーネスを性能改善保証としない。CLI/合成試験でDesktop対応を主張しない。

## 実環境の操作

個人sourceの登録/設定変更、既存アプリ再起動、管理者/ACL/実行policy変更、配布/公開は個別承認が必要。sourceの所有/任意性を推測で決めず、Normal/旧favorite/個人登録と独立編集を保持する。
