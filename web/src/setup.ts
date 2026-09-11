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
      ? '初回は零式で相談する流れを希望します。Normalの退避と任意対象の確認を先に済ませてください。保存設定がまだなければ、read_setupにschemaVersion:3を渡し、登録した通常Skillを無効か手動から選びます。このMac版では公式プラグインを保持し、登録済みのプラグインもすべてNormal状態を引き継ぎます。追加指示と限定解除への追加がない暫定の2構成をreview_setupで確認し、apply_setupで保存してから、別操作で零式を準備します。暫定の2構成が同じ内容になることを示してください。既存の保存設定は暫定案で上書きせず確認します。その後、新しいタスクで短い最初の応答を完了し、GUIまたは元の管理タスクから読み込み記録を確認して、同じ新規タスクの次の応答で相談を続けます。通常Skillの入力対応と、公式プラグイン全体の未確認の実行状態を分けて報告してください。'
      : '今回の相談は現在の構成から始めてください。相談のために自動で零式へ切り替えないでください。',
    '使用中のモデルを確認し、そのモデルとアプリの公式情報・確認日・提案理由を残してください。モデル固有の情報がなければ、その範囲を明示してください。',
    '新しい提案はschemaVersion=3を使い、read_setupにschemaVersion:3を渡して取得したinventoryIdを指定してください。零式は追加指示をなくし、登録した通常Skillをそれぞれ無効か手動にします。限定解除は零式を継承し、選んだSkillだけ手動・自動へ上げます。Normalで無効だったSkillを有効にする場合も、その変更を明示して確認してください。',
    '現行Codexでは公式プラグインの個別OFFが反映されないため、このMac版では切替対象に登録せず、現在の状態で保持してください。read_setupのpluginControlsも確認し、既に登録されているプラグインはtrueform.retainedOfficialPluginIdsへ含め、unseal.additionalPluginIdsは空にして両モードでNormalを保ちます。OFFが含まれる以前の設定は変更前に説明し、両モードの保持へ直した新しい案を確認・保存してください。導入済み一覧や書ける設定項目だけでOFF対応済みと判断しないでください。',
    '追加指示は固定の最小ガイドか、なしを相談します。零式の選択を変えるときは両モードへの影響を一緒に示してください。公式プラグインのSkill・MCP・hook等は保持し、実行状態の未確認を示してください。旧規則の保存版・お気に入りは書き換えないでください。',
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
    ? '零式を引き継ぎ、選んだSkillと指示を追加する。公式プラグインは保持。'
    : '通常Skillは無効か手動。公式プラグインは保持する。';
  if (schemaVersion === 2) return mode === 'unseal'
    ? '零式の全対象を引き継ぎ、保存した追加Skillと指示を使う。'
    : '追加指示を外し、選んだ公式プラグインの自動使用だけを残す。';
  return mode === 'unseal'
    ? '保存した設定で、追加指示とSkillの自動使用を調整する。'
    : '選んだ追加指示を外す。自作Skillは明示的に呼び出す。';
}
