import type { ReactNode } from 'react';
import { text as t } from '../locale.ts';

type Candidate = { id: string; label: string; description?: string | null; eligible?: boolean };
function displayName(row: Candidate, application: 'codex' | 'claude') {
  return row.id.startsWith('instructions-')
    ? application === 'claude' ? t('いつもの追加指示（CLAUDE.md）', 'Your added instructions (CLAUDE.md)')
      : t('いつもの追加指示（AGENTS.md）', 'Your added instructions (AGENTS.md)')
    : row.label;
}
function explanation(row: Candidate): string {
  return row.id.startsWith('instructions-')
    ? t('普段の作業に追加している指示です。', 'Instructions added to everyday work.')
    : t('AIに頼む作業で使えるSkillです。', 'A Skill available for work with AI.');
}
export function RegistrationChoices({ rows, selectedIds, checked, busy, onToggle, onChecked, details, application = 'codex' }: {
  rows: Candidate[]; selectedIds: string[]; checked: boolean; busy: boolean;
  onToggle: (id: string, selected: boolean) => void; onChecked: (value: boolean) => void; details: ReactNode;
  application?: 'codex' | 'claude';
}) {
  return <section className="registration-choices" aria-label={t('保存するものを選ぶ', 'Choose what to save')}>
    {rows.length ? <div className="registration-candidates">{rows.filter(row => row.eligible !== false).map(row =>
      <label key={row.id} className="registration-candidate"><input type="checkbox" aria-label={displayName(row, application)} checked={selectedIds.includes(row.id)}
        disabled={busy} onChange={event => onToggle(row.id, event.target.checked)}/>
        <span><strong>{displayName(row, application)}</strong><small>{row.description?.trim() || explanation(row)}</small></span></label>)}</div>
      : <p>{t('まず追加設定の候補を確認してください。', 'Review the added-setting candidates first.')}</p>}
    {rows.length > 0 && <label className="source-declaration"><input type="checkbox" checked={checked} disabled={busy}
      onChange={event => onChecked(event.target.checked)}/>
      {t('これは自分で追加したもので、外しても仕事の決まりには影響しません', 'I added these items, and removing them will not affect work requirements.')}</label>}
    <details className="registration-details"><summary>{t('詳しく', 'Details')}</summary>{details}</details>
  </section>;
}

export function InitialSetupPanel({ children }: { children: ReactNode }) {
  return <section className="initial-setup" aria-label={t('はじめに', 'Getting started')}>
    <h1>{t('はじめに：いつもの構成を保存します', 'First, save your usual setup')}</h1>
    <p>{t('このMacで、残しておきたい追加設定を選びます。保存後にAIと零式の中身を決められます。',
      'Choose the added settings to keep on this Mac. After saving, decide TRUEFORM with AI.')}</p>
    {children}
  </section>;
}
