# Codex 0.155.0-alpha.16.4 の自動確認（2026-09-25）

- 実行ファイル：`/Applications/ChatGPT.app/Contents/Resources/codex`。`initialize` は `0.155.0-alpha.16.4` を返した。SHA-256：`93169e745735930598e867ad837abf3fdc50774a3ad7e7aa89c0d0c51b0189a5`。
- 自動確認の source revision：`55b4b38b1d3c5458f53ba8ff0aef4bde5e8fa1a180302c98be3b2bd300545919`。`HOME`・`CODEX_HOME`、Skill、保存先は一時ディレクトリ内の合成データだけとし、確認後に削除した。この確認では利用者の Codex 設定を読み書きしていない。
- `read`：成功。`config/read` の user layer は、合成 Skill の明示的な `enabled = true`、コメント、model、approval policy、sandbox mode、選択対象と別のプラグイン設定を読み戻した。
- `disable`：成功。`skills/config/write(enabled: false)` 後の読み戻しは false。コメントと他の設定は保持された。
- `restore`：成功。無効化後、保存した合成 config のバイト列へ戻し、別の app-server で true を読み戻した。別の合成登録データで `planUserMode(trueform)` → `applyUserPlan` → `planUserMode(normal)` → `applyUserPlan` も両方 `matched`、config のバイト列は元と一致した。
- `enable`：不合格。`enabled: true` に戻した際、明示的な Skill の項目を保持する条件を満たさなかったため、許可しない。
- `plugin-disable`：成功。合成の対象プラグインを false にし、別のプラグインとメタデータ、コメントが保持されたことを読み戻した。
- 未確認：実際に導入されたプラグインの有効状態、複数 Skill の同時編集、独立変更を挟む復旧、Desktop の新規タスクでの読み込み。実データへの切替は行っていない。
- 補助的に `codex --version` を一度、合成 HOME を指定せず実行した。設定ファイルの明示的な読み書きは行っていないが、この起動の内部アクセスまでは確認していない。上の操作別の自動確認と切替試験はすべて合成 HOME で行った。
