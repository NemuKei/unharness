import { text as t } from '../locale.ts';
export const publicModes = {
  normal: { title: 'Normal', get label() { return t('通常装備', 'Your usual setup'); }, scene: 'baseline', get description() { return t('保存しておいた、いつもの構成へ。', 'Return to your saved everyday setup.'); } },
  unseal: { title: 'UNSEAL', get label() { return t('限定解除', 'Selective release'); }, scene: 'manual-only', get description() { return t('零式を土台に、必要なSkillや最小限の指示を加える。', 'Start from TRUEFORM and add the Skills and minimal guidance you need.'); } },
  trueform: { title: 'TRUEFORM', get label() { return t('零式', 'Minimal loadout'); }, scene: 'fixed-only', get description() { return t('選んだ追加指示を外し、切替対象の自作・外部Skillを無効または手動に。', 'Try selected optional instructions off, with your selected Skills disabled or called explicitly.'); } },
} as const;

// Illustrative settings, never a projection of the visitor's configuration.
export const demoSources = {
  normal: { get instructions() { return t('保存した指示を使う', 'Saved instructions'); }, get authoredSkill() { return t('自動で使う', 'Automatic'); }, get externalSkill() { return t('自動で使う', 'Automatic'); } },
  unseal: { get instructions() { return t('最小ガイドを使う', 'Minimal guide'); }, get authoredSkill() { return t('自動で使う', 'Automatic'); }, get externalSkill() { return t('自分で呼び出して使う', 'Explicit use'); } },
  trueform: { get instructions() { return t('選んだ追加指示を外す', 'Selected instructions off'); }, get authoredSkill() { return t('自分で呼び出して使う', 'Explicit use'); }, get externalSkill() { return t('使わない', 'Disabled'); } },
} as const;
