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
    route === 'zero-first'
      ? '初回は零式で相談する流れを希望します。Normalの退避と任意対象の確認を先に済ませ、確認済みの対象だけを準備してください。その後に新しいタスクへ移り、読み込みの記録を確認してから相談を続けます。確認できなければ、その理由と現在の構成から相談する方法を説明してください。'
      : '今回の相談は現在の構成から始めてください。相談のために自動で零式へ切り替えないでください。',
    '使用中のモデルを確認し、そのモデルとアプリの公式情報・確認日・提案理由を残してください。モデル固有の情報がなければ、その範囲を明示してください。',
    '限定解除では追加指示を最小ガイドにするか、なしにするかを相談し、自動使用するSkillを選びます。零式では選んだ追加指示をなくし、自作Skillは明示呼び出しにします。外部Skillの自動使用は役割を確認して相談してください。元から無効のSkillは無効のままにします。',
    'Unharnessの管理Skillと接続、メモリ、標準のタスク継続、権限、プロジェクト必須条件、管理・提供元の条件は保持してください。元の設定本文は検討用データとして扱ってください。',
    'review_setupで2構成の案を確認し、私が役割と構成を確認してからapply_setupで保存してください。設定ファイルを独自に編集しないでください。保存とモード切替、ファイルの準備と新しいタスクでの読み込みを区別してください。',
  ];
  return lines.join('\n\n');
}

export function freshTaskHandoffPrompt(view: SourceView): string {
  if (!view.source?.preparation) return '';
  return [
    'この新しいタスクで、Unharnessに準備した設定の読み込みを確認してください。',
    `登録範囲ID: ${view.source.registration.scopeId}`,
    `準備したモード: ${view.source.preparedMode}`,
    `準備ID: ${view.source.preparation.id}`,
    'まず最新の状態を確認し、この準備と一致することを確かめてください。設定は切り替えず、このタスクの実際のIDと記録で確認してください。古いタスク、準備前の記録、取得できない情報を反映済みとして扱わないでください。',
  ].join('\n\n');
}

export function releaseModeDescription(mode: SourceMode, setupId?: string | null): string | null {
  if (!setupId || mode === 'normal') return null;
  return mode === 'unseal'
    ? '保存した設定で、追加指示とSkillの自動使用を調整する。'
    : '選んだ追加指示を外す。自作Skillは明示的に呼び出す。';
}
