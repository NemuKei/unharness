export const publicModes = {
  normal: { title: 'Normal', label: '通常装備', scene: 'baseline', description: '保存しておいた、いつもの構成へ。' },
  unseal: { title: 'UNSEAL', label: '限定解除', scene: 'manual-only', description: '零式を土台に、必要なSkillや最小限の指示を加える。' },
  trueform: { title: 'TRUEFORM', label: '零式', scene: 'fixed-only', description: '選んだ追加指示を外し、切替対象の自作・外部Skillを無効または手動に。' },
} as const;

// These are illustrative settings, never a projection of the visitor's configuration.
export const demoSources = {
  normal: { instructions: '保存した指示を使う', authoredSkill: '自動で使う', externalSkill: '自動で使う' },
  unseal: { instructions: '最小ガイドを使う', authoredSkill: '自動で使う', externalSkill: '自分で呼び出して使う' },
  trueform: { instructions: '選んだ追加指示を外す', authoredSkill: '自分で呼び出して使う', externalSkill: '使わない' },
} as const;
