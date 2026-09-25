import { text as t } from '../locale.ts';
import type { SourceMode } from '../sources.ts';

export type LoadoutState = 'automatic' | 'manual' | 'disabled';
export type LoadoutSkill = { id: string; normalState: LoadoutState; availableStates: LoadoutState[];
  requiredControl: boolean; label?: string; description?: string | null };
export type CodexOperations = { read: boolean; disable: boolean; enable: boolean; 'plugin-disable': boolean };
export type Choice = { state: LoadoutState; label: string; enabled: boolean; reason: string | null };
const states: LoadoutState[] = ['automatic', 'manual', 'disabled'];
const rank = (state: LoadoutState) => ({ disabled: 0, manual: 1, automatic: 2 })[state];
export function loadoutStateLabel(state: LoadoutState): string {
  return state === 'automatic' ? t('自動で使う', 'Use automatically')
    : state === 'manual' ? t('呼んだときだけ', 'Only when called') : t('使わない', 'Do not use');
}

export function loadoutChoices({ mode, skill, trueformState, normalEnabled, codexOperations }: {
  mode: Exclude<SourceMode, 'normal'>; skill: LoadoutSkill; trueformState: LoadoutState;
  normalEnabled: boolean; codexOperations: CodexOperations;
}): { options: Choice[] } {
  return { options: states.map(state => {
    let reason: string | null = null;
    if (mode === 'trueform' && state === 'automatic') reason = t('零式は何も足さない構成です', 'TRUEFORM adds nothing');
    else if (mode === 'unseal' && rank(state) < rank(trueformState)) reason = t('零式より下げることはできません', 'Cannot go below TRUEFORM');
    else if (state !== skill.normalState && !skill.availableStates.includes(state)) reason = t('このSkillでは選べません', 'Unavailable for this Skill');
    else if ((!normalEnabled && state !== 'disabled' && !codexOperations.enable)
      || (normalEnabled && state === 'disabled' && !codexOperations.disable))
      reason = t('このCodexの版では、まだ確認していません', 'This operation has not been checked for this Codex version');
    return { state, label: loadoutStateLabel(state), enabled: reason === null, reason };
  }) };
}

const defaultState = (skill: LoadoutSkill): LoadoutState => skill.normalState === 'disabled' ? 'disabled' : 'manual';
export function loadoutInitial({ mode, skills, saved, trueform = {}, proposal }: {
  mode: Exclude<SourceMode, 'normal'>; skills: LoadoutSkill[]; saved: Record<string, LoadoutState> | null;
  trueform?: Record<string, LoadoutState>;
  proposal: { kind: string; mode: SourceMode; status: string; items: { sourceId: string }[] } | null;
}): { choices: Record<string, LoadoutState>; recommendedIds: string[] } {
  const choices = Object.fromEntries(skills.filter(skill => !skill.requiredControl)
    .map(skill => [skill.id, saved?.[skill.id] ?? defaultState(skill)])) as Record<string, LoadoutState>;
  const recommendedIds: string[] = [];
  if (proposal?.status === 'pending' && proposal.mode === mode) for (const item of proposal.items) {
    if (!Object.hasOwn(choices, item.sourceId)) continue;
    const state = mode === 'trueform' ? 'disabled' : proposal.kind === 'add' ? 'automatic'
      : proposal.kind === 'remove' ? trueform[item.sourceId] ?? null : null;
    if (state) { choices[item.sourceId] = state; recommendedIds.push(item.sourceId); }
  }
  return { choices, recommendedIds };
}

export function loadoutChanges({ skills, before, after }: {
  skills: { id: string; label: string }[]; before: Record<string, LoadoutState>;
  after: Record<string, LoadoutState>;
}): string[] {
  return skills.filter(skill => before[skill.id] && after[skill.id] && before[skill.id] !== after[skill.id])
    .map(skill => `${skill.label}：${loadoutStateLabel(before[skill.id])} → ${loadoutStateLabel(after[skill.id])}`);
}

export function loadoutPrompt({ mode, skills, choices }: { mode: Exclude<SourceMode, 'normal'>;
  skills: { id: string; label: string }[]; choices: Record<string, LoadoutState> }): string {
  const name = mode === 'trueform' ? t('零式', 'TRUEFORM') : t('限定解除', 'UNSEAL');
  const rows = skills.filter(skill => choices[skill.id]).map(skill => `${skill.label}：${loadoutStateLabel(choices[skill.id])}`).join('\n');
  return t(`Unharnessの${name}の中身を自分で選びました。次の選択について、外すもの・残すものと理由の意見を聞かせてください。\n${rows}\n仕事の決まり、権限、メモリ、管理機能は残してください。まだ設定は変えないでください。`,
    `I chose the contents of ${name} in Unharness. Please give your opinion and reasons for what to keep or remove.\n${rows}\nPreserve work requirements, permissions, memory and management. Do not change settings yet.`);
}

type Selection = { sourceId: string; state: LoadoutState };
type SavedProposal = { schemaVersion: number; roles?: Array<{ sourceId: string; origin: string; reason: string }>;
  trueform?: { skillStates?: Selection[]; retainedOfficialPluginIds?: string[] };
  unseal?: { instructions: 'none' | 'minimal' | 'custom'; customInstructions?: string;
    skillElevations?: Selection[]; additionalPluginIds?: string[] } };
type Setup = { scopeId: string; normalId: string; inventory: { inventoryId: string; skills: LoadoutSkill[];
  plugins: Array<{ id: string; eligibility: string; normalEnabled: boolean }> }; proposal: SavedProposal | null;
  enrollment?: { roles?: SavedProposal['roles'] } | null };
const localBasis = () => ({ application: 'codex', modelId: null, modelSource: 'local-choice',
  desktopVersion: null, runtimeVersion: null, references: [], rationale: '画面で利用者が装備の使い方を選びました。' });

export function loadoutProposal({ setup, mode, choices, sources }: { setup: Setup; mode: Exclude<SourceMode, 'normal'>;
  choices: Record<string, LoadoutState>; sources: { id: string }[] }) {
  const ordinary = setup.inventory.skills.filter(skill => !skill.requiredControl);
  const saved = setup.proposal;
  const savedStates = saved && saved.schemaVersion >= 3 ? saved : null;
  const base = ordinary.map(skill => ({ sourceId: skill.id,
    state: savedStates?.trueform?.skillStates?.find(row => row.sourceId === skill.id)?.state ?? defaultState(skill) }));
  if (mode === 'trueform') for (const row of base) row.state = choices[row.sourceId] ?? row.state;
  let elevations = (savedStates?.unseal?.skillElevations ?? []).filter(row => base.some(skill => skill.sourceId === row.sourceId
    && rank(row.state) > rank(skill.state)));
  if (mode === 'unseal') elevations = ordinary.flatMap(skill => {
    const wanted = choices[skill.id] ?? base.find(row => row.sourceId === skill.id)!.state;
    const initial = base.find(row => row.sourceId === skill.id)!.state;
    return rank(wanted) > rank(initial) ? [{ sourceId: skill.id, state: wanted }] : [];
  });
  const ids = new Set(setup.inventory.skills.map(skill => skill.id));
  const roles = (saved?.roles ?? setup.enrollment?.roles)?.filter(row => ids.has(row.sourceId));
  const confirmedRoles = roles?.length === setup.inventory.skills.length ? roles.map(role => role.origin === 'unknown'
    ? { sourceId: role.sourceId, origin: 'user-confirmed', reason: '画面で自分の任意Skillとして確認しました。' } : role)
    : setup.inventory.skills.map(skill => ({
    sourceId: skill.id, origin: 'user-confirmed', reason: skill.requiredControl
      ? '登録済みの管理機能として常に残します。' : '画面で自分の任意Skillとして確認しました。',
  }));
  const oldUnseal = savedStates?.unseal;
  const instructionStyle = saved?.unseal?.instructions === 'minimal' || saved?.unseal?.instructions === 'none'
    ? saved.unseal.instructions : sources.some(source => source.id.startsWith('instructions-')) ? 'minimal' : 'none';
  const unseal = oldUnseal ? { instructions: oldUnseal.instructions, ...(oldUnseal.instructions === 'custom'
    ? { customInstructions: oldUnseal.customInstructions } : {}), skillElevations: elevations,
    additionalPluginIds: oldUnseal.additionalPluginIds ?? [] }
    : { instructions: instructionStyle, skillElevations: elevations, additionalPluginIds: [] as string[] };
  return { schemaVersion: 4, scopeId: setup.scopeId, normalId: setup.normalId,
    inventoryId: setup.inventory.inventoryId, basis: localBasis(), roles: confirmedRoles,
    trueform: { skillStates: base, retainedOfficialPluginIds: saved?.trueform?.retainedOfficialPluginIds
      ?? setup.inventory.plugins.filter(plugin => plugin.eligibility === 'official-confirmed' && plugin.normalEnabled).map(plugin => plugin.id) },
    unseal };
}
