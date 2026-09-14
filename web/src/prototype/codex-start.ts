import type { MacCodexRelease } from '../site-config';
import type { Locale } from './copy';

// Construct the draft route observed in the Mac app; do not invoke it here.
// Native launch and prefill still need version-specific UI verification.
export function codexDraftLink(prompt: string) {
  const url = new URL('codex://new');
  url.searchParams.set('mode', 'codex');
  url.searchParams.set('prompt', prompt);
  return url.href;
}

export function startupRequest(release: MacCodexRelease | null, locale: Locale) {
  const instructions = locale === 'ja' ? [
    'このMacのCodexでUnharnessを使い始めたいです。日本語で案内してください。',
    'まず導入状況と、実際に使うCodexのプロファイル・作業場所を確認してください。不明な対象は私に確認してください。',
    '未導入なら、配布元と照合値を確認し、導入する版・変更内容を説明して、実行前に確認してください。展開した「はじめに.md」の手順を使ってください。',
    '導入済みなら、今の版と接続先を確認し、更新が必要か、次に何ができるかを案内してください。下記の版への再導入やダウングレード、初期設定のやり直しは自動で行わないでください。',
    '保存済みNormal・設定・作品・メモリ・実行権限を保持してください。初回は対象確認とNormal保存へ案内し、モードやSkill本文の変更は私が希望したときに進めてください。',
  ] : [
    'Help me get started with Unharness in Codex on this Mac. Please guide me in English.',
    'First check whether it is installed, and confirm the actual Codex profile and working location. Ask me if the target is unclear.',
    'If it is not installed, verify the release source and checksums, explain the version and changes, and ask before installing. Follow the bundled はじめに.md.',
    'If it is installed, check its current version and connection, then suggest whether an update or another action is useful. Do not automatically reinstall, downgrade to the version below, or repeat initial setup.',
    'Preserve saved Normal, settings, artwork, memory and execution permissions. For first use, guide target review and saving Normal. Change modes or Skill content only when I request it.',
  ];
  if (release) instructions.push(
    '\n' + (locale === 'ja' ? '確認用の公開配布版: ' : 'Published release for reference: ') + release.version,
    'ZIP: ' + release.archiveUrl,
    'SHA-256: ' + release.archiveSha256,
    'Distribution ID: ' + release.distributionId,
    'Source: ' + release.sourceUrl,
  );
  else instructions.push('\nhttps://unharness.deltahelmlab.com/');
  return instructions.join('\n');
}
