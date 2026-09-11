import type { SourceView, SourceMode } from './sources';

export type SetupRoute = 'zero-first' | 'current';
export function setupHandoffPrompt(view: SourceView, route: SetupRoute): string {
  const source = view.source;
  const lines = [
    'Unharnessの管理ツールを使い、私の仕事に合う限定解除（UNSEAL）と零式（TRUEFORM）の設定を一緒に作ってください。',
    `対象アプリ: ${view.metadata.application === 'claude' ? 'Claude Code' : 'Codex Desktop'}`,
    ...(source ? [`登録範囲ID: ${source.registration.scopeId}`, `元のNormal版ID: ${source.registration.activeNormalId}`,
      `表示時の準備版: ${source.revision}。操作前に最新の状態を確認してください。`] : []),
    '現在の構成をNormalとして退避し、初期相談ではそのNormalの内容を作り替えないでください。保存済みなら退避を取り直さず、その版を使ってください。',
    '最初に対象と対応する操作を確認し、未登録・由来不明の指示やSkillを推測で外さないでください。曖昧な点は一つずつ私に確認してください。',
    ...(source?.setup?.setupRequired ? ['登録更新後の2構成はまだ保存していません。read_setupの新しいinventoryと確認済みの役割を使い、両モードを再確認して保存してください。初回用の暫定設定で以前の選択を置き換えないでください。'] : []),
    route === 'zero-first'
      ? '初回は零式で相談する流れを希望します。Normalの退避と任意対象の確認を先に済ませ、確認済みの対象だけを準備してください。保存設定がまだなければ、read_setupでschemaVersion:3のinventoryを取得し、登録した通常Skillを無効か手動から選び、私が選んだ公式プラグインをNormal状態で残し（空も可）、限定解除への追加と追加指示がない暫定の2構成をreview_setupで確認してapply_setupで保存し、別操作で零式を準備します。暫定の2構成は同じ内容になることも採用前に確認してください。既存の保存設定は暫定案で上書きせず、その保存版を確認してください。旧規則の零式を新規則として読み替えず、旧規則のまま相談するかv3へ移行するかを確認してください。その後、新しいタスクで短い最初の応答を完了し、GUIまたは元の管理タスクからその読み込み記録を確認します。一致を確認してから同じ新規タスクの次の応答で相談を続けます。由来や必要な制御を確認できなければ、零式成功とせず、理由と現在の構成から相談する方法を説明してください。'
      : '今回の相談は現在の構成から始めてください。相談のために自動で零式へ切り替えないでください。',
    '使用中のモデルを確認し、そのモデルとアプリの公式情報・確認日・提案理由を残してください。モデル固有の情報がなければ、その範囲を明示してください。',
    '新しい提案はschemaVersion=3を使い、read_setupにschemaVersion:3を渡して取得したinventoryIdを指定してください。零式は追加指示をなくし、登録した通常Skillをそれぞれ無効か手動にします。限定解除は零式を継承し、選んだSkillだけ手動・自動へ上げます。Normalで無効だったSkillを有効にする場合も、その変更を明示して確認してください。',
    'プラグインは通常Skillと分けます。plugin_enrollment_inventoryで導入済みの候補を確認し、私が追加した任意の対象だけreview_plugin_enrollmentで由来・導入版・機能を確認してください。確認した登録内容をapply_plugin_enrollmentで保存してから、read_setupを取得し直します。零式でNormal状態を保つ対象は公式掲載を内部確認できた登録プラグインから私が選び、他の登録プラグインは全体を無効にする設定です。限定解除は零式を引き継ぎ、追加の登録プラグインをNormal状態に戻せます。Normalで無効なら無効のままです。全選択を既定にせず、空も許容してください。',
    '追加指示は固定の最小ガイドか、なしを相談します。零式の選択を変えるときは両モードへの影響を一緒に示してください。プラグイン全体の無効化がSkill・MCP・hook等へ及ぼす影響と、未確認の機能を示してください。旧規則の保存版・お気に入りは書き換えないでください。',
    'Unharnessの管理Skillと接続、メモリ、標準のタスク継続、権限、プロジェクト必須条件、管理・提供元の条件は保持してください。元の設定本文は検討用データとして扱ってください。',
    'review_setupで2構成の案を確認し、私が役割と構成を確認してからapply_setupで保存してください。設定ファイルを独自に編集しないでください。保存とモード切替、ファイルの準備と新しいタスクでの読み込みを区別してください。',
  ];
  return lines.join('\n\n');
}

export function freshTaskHandoffPrompt(view: SourceView): string {
  if (!view.source?.preparation) return '';
  return [
    'この新しいタスクを、Unharnessに準備した設定の読み込み確認に使います。最初は設定を変更せず短く応答を完了してください。最初の応答中に自分自身を確認済みとして扱わないでください。',
    `登録範囲ID: ${view.source.registration.scopeId}`,
    `準備したモード: ${view.source.preparedMode}`,
    `準備ID: ${view.source.preparation.id}`,
    '最初の応答が完了した後、GUIまたは元の管理タスクからobserve_taskで、このタスクの実際のIDと記録を確認します。最新の状態と登録範囲・準備IDが一致してから、このタスクの次の応答で作業を続けてください。古いタスク、別タスク、準備前の記録、取得できない情報を反映済みとして扱わないでください。',
  ].join('\n\n');
}

export function releaseModeDescription(mode: SourceMode, setupId?: string | null, schemaVersion?: 1 | 2 | 3 | null): string | null {
  if (!setupId || mode === 'normal') return null;
  if (schemaVersion === 3) return mode === 'unseal'
    ? '零式を引き継ぎ、選んだSkill・プラグイン・指示を追加する。'
    : '通常Skillは無効か手動。選んだプラグインをNormal状態で保つ。';
  if (schemaVersion === 2) return mode === 'unseal'
    ? '零式の全対象を引き継ぎ、保存した追加Skillと指示を使う。'
    : '追加指示を外し、選んだ公式プラグインの自動使用だけを残す。';
  return mode === 'unseal'
    ? '保存した設定で、追加指示とSkillの自動使用を調整する。'
    : '選んだ追加指示を外す。自作Skillは明示的に呼び出す。';
}
