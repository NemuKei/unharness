# Windows側のCodexへの引き継ぎ

2026-09-14 作成。**Windows版は、検証済みの完成品を確認する段階ではなく、
既存の基礎を使って不足するWindows対応を実装・検証する段階**にある。
この文書を入口に、[Windows実行計画](superpowers/plans/2026-09-14-windows-codex-qualification.md)
を順に進める。Mac用ZIPをWindowsで実行したり、OS制限を外すだけで対応済みとしない。

## Control

- workflow_mode: `prepare`
- launch_mode: `continue` — 利用者がこの引き継ぎでWindows対応・検証を依頼したタスクで使う。
- destination_intent: `brief-only` — この文書の作成で別タスクを自動作成・送信していない。
- authorized_scope: 最新ソースの調査、Windowsネイティブの読み取り専用診断、
  新しく作成する合成環境での検証、そこで必要と分かったrepo内の互換性修正と検証。
  意味のある変更はAGENTSに従ってscoped commit/pushする。
- 別途の明示承認が必要: 個人用プロファイルへの登録・設定変更、既存アプリの再起動、
  管理者操作・ACL/サンドボックス/実行ポリシーの変更、Windows配布物の公開・本番デプロイ。
  その場で既に対象と操作を承認されていれば、同じ確認を繰り返さない。

## Direction

目標は、WindowsのCodex Desktopで **Normalを保存 → 1つのモードを準備 →
新しいタスクで確認 → 普段の仕事を記録 → お気に入り → Normalへ復帰** ができ、
AIやサイトが開けない場合にも独立して復旧できること。

Unharnessは無料のローカルツール。選んだ任意の追加指示・通常Skillを着脱して、
モデル・環境・仕事に合う構成を探す。軽い構成の性能向上を約束しない。
保存済みNormal、過去の保存版、メモリ、標準のタスク継続、権限、プロジェクト要件、
管理・提供元の条件、Unharness自身の管理接続を保持する。

今回のWindows初期対応も、追加指示と通常Skillの無効・手動・自動を中心にする。
公式プラグインはNormal状態を保持する。個別OFF、Claude Code、同時多モード実行、
公開ギャラリー、X用動画の再制作は、この作業に追加しない。
外観は性能やモード設定と独立し、白銀・琥珀・既存作品を自由に再選択できる。

## 確認済みの状態と、未確認の状態

| 対象 | 引き継ぐ事実 |
| --- | --- |
| Mac版 | 0.0.10を公開済み。配布ソースは`6ca76702fefc867a66416c8fa434256e99025d0c`。日英・更新確認・独立復旧の証拠は[公開確認](evidence/2026-09-14-guided-product.md)にある |
| 今回の調査元 | mainの`6ddaec6e4af79a57b33757b0d91d3fb481305715`。この後に引き継ぎ文書を追加しているため、Windowsではこの古いSHAへ戻さず、文書を含む最新mainから始める |
| Windowsの既存結果 | 2026-09-07のWindows 11 x64 / Codex 0.153.4で、CLI診断・6条件の一時fixture・保存復帰・当時のGUI smokeを確認。現行全製品の合格ではない |
| Windowsの新規タスク | 最初のbaselineは`not-matched-record`。期待したSkillカタログが記録になく、refresh後の新しいタスク確認は未完了。原因は未確定 |
| 実設定・配布・復旧 | Mac専用の制限や起動方法が残る。現在のコード上の箇所と着手順は[実行計画](superpowers/plans/2026-09-14-windows-codex-qualification.md#現在の差分地図)にある |
| 今回のMacでの作業 | 引き継ぎの準備だけ。Windowsホストへの接続、Windows版の実装、Windows実機検証は行っていない |

古いWindowsのテスト数148件や当時の画面を、現在の合格結果として使わない。
最新Macのテスト成功もWindowsの証拠にはしない。

## 最初に読む順番

1. [AGENTS.md](../AGENTS.md)と、この文書。
2. [現在の状態](status.md)・[互換性の境界](compatibility.md)で基準を確認。
3. [Windows実行計画](superpowers/plans/2026-09-14-windows-codex-qualification.md)のW0から開始。
   以降の仕様は、各工程に書いた必要なものだけ読む。

Mac側の継続作業用worktree、lockedな再実行フォルダー、個人の保存データを
Windowsへコピー・削除しない。Gitのソースから進める。古いlocalhostポート、
タブ番号、私的なfixtureパス・task UUID・一時スクリプトは再開条件に使わない。

## 最初の行動

Windowsの実際のcheckoutを確認し、dirty・分岐・remoteを読む。必要なら無関係な
変更を保持した新しいworktreeを用意し、最新origin/mainを基準にする。
ネイティブWindowsのNode.js 24+、実際に使う`codex.exe`、Desktop版、CPU、
現在のサンドボックス・ファイルシステムを確認してW0を記録する。
WSL結果でWindows欄を合格にせず、以前の`danger-full-access`という観測を設定例にしない。

単に「Windows未対応でした」で止めず、既存の安全な診断を実行し、失敗を工程別に
切り分ける。未知のOS動作はWindowsの合成環境で再現してから修正する。
安全な工程は続け、実データ・権限・再起動など本人の判断が必要な工程だけ止める。

## 返すもの

- 検証したGit SHA、OS/CPU、PowerShell/Node/CLI/Desktopの版、native/WSLの区別。
- 実行計画W0〜W6の`pass / fail / blocked / not-run`と根拠。予定やskipはpassにしない。
- 修正内容・commit・実行した検証。共通部分を変えた場合はMacへ戻す確認項目。
- `docs/evidence/YYYY-MM-DD-windows-codex-*.md`の匿名化した証拠。
  ローカルの生ログ、設定本文、認証、実ユーザーの作品・会話・識別子はcommitしない。
- まだWindows対応を名乗れない場合は、次の最小の作業と、本人だけが決める項目。

配布ZIPの作成、CLIでの導入成功、ファイル準備、新しいDesktopタスクでの読み込み、
公開HTTPSでの操作は、それぞれ別に確認する。
