import { useEffect, useId, useMemo, useState } from 'react';
import { text as t } from '../locale.ts';
import { ApiError } from '../api.ts';
import { AiRequestButton } from '../AiRequestButton.tsx';
import { bindChatScope } from '../chat-requests.ts';
import type { SourceMode, SourceRow } from '../sources.ts';
import type { useSourceController } from '../useSourceController.ts';
import { FailureNotice } from './FailureNotice.tsx';
import { loadoutChoices, loadoutChanges, loadoutInitial, loadoutPrompt, loadoutProposal, loadoutStateLabel } from './loadout-editor-view.ts';
import type { CodexOperations, LoadoutSkill, LoadoutState } from './loadout-editor-view.ts';
import { applyLoadout } from './loadout-editor-action.ts';

type Controller = ReturnType<typeof useSourceController>;
type EditorSkill = LoadoutSkill & { label: string; description: string | null };
type Read = { scopeId: string; normalId: string; setupId: string | null;
  inventory: { inventoryId: string; skills: LoadoutSkill[];
    plugins: Array<{ id: string; eligibility: string; normalEnabled: boolean }> } | null;
  proposal: Parameters<typeof loadoutProposal>[0]['setup']['proposal'];
  enrollment?: Parameters<typeof loadoutProposal>[0]['setup']['enrollment'];
  codexOperations?: CodexOperations };
type Contents = { modes: Partial<Record<SourceMode, { available: boolean;
  skills: Array<{ id: string; state: LoadoutState | 'unknown' }> }>> };
type Recommendation = { kind: string; mode: SourceMode; status: string; items: { sourceId: string }[] } | null;
const normalOperations: CodexOperations = { read: false, disable: false, enable: false, 'plugin-disable': false };
const stateMap = (rows: Array<{ id: string; state: LoadoutState }>) => Object.fromEntries(rows.map(row => [row.id, row.state])) as Record<string, LoadoutState>;

export function LoadoutChoices({ mode, skills, choices, trueformStates = {}, recommendedIds, codexOperations, onChoice }: {
  mode: Exclude<SourceMode, 'normal'>; skills: EditorSkill[]; choices: Record<string, LoadoutState>;
  trueformStates?: Record<string, LoadoutState>; recommendedIds: string[]; codexOperations: CodexOperations;
  onChoice: (id: string, state: LoadoutState) => void;
}) {
  const prefix = useId();
  return <div className="loadout-choices">{skills.filter(skill => !skill.requiredControl).map((skill, index) => {
    const base = trueformStates[skill.id] ?? (skill.normalState === 'disabled' ? 'disabled' : 'manual');
    const options = loadoutChoices({ mode, skill, trueformState: base, normalEnabled: skill.normalState !== 'disabled', codexOperations }).options;
    return <fieldset className="loadout-skill" key={skill.id}><legend>{skill.label}</legend>
      <p>{skill.description || t('登録済みのSkillです。', 'A registered Skill.')}</p>
      <div className="loadout-options">{options.map(option => <label key={option.state} htmlFor={`${prefix}-${index}-${option.state}`}>
        <input id={`${prefix}-${index}-${option.state}`} type="radio" name={`${prefix}-${index}`}
          checked={choices[skill.id] === option.state} disabled={!option.enabled}
          onChange={() => onChoice(skill.id, option.state)}/>
        <span>{option.label}{recommendedIds.includes(skill.id) && choices[skill.id] === option.state ? ' ★' : ''}</span>
        {option.reason && <small>{option.reason}</small>}
      </label>)}</div>
    </fieldset>;
  })}</div>;
}

export function LoadoutConfirmation({ changes, busy, onConfirm, onCancel }: { changes: string[]; busy: boolean;
  onConfirm: () => void; onCancel: () => void }) {
  return <div className="loadout-confirm" role="group" aria-label={t('変更内容の確認', 'Review changes')}>
    <h3>{t('変更内容の確認', 'Review changes')}</h3>
    {changes.length ? <ul>{changes.map(row => <li key={row}>{row}</li>)}</ul>
      : <p>{t('Skillの使い方は今の保存内容と同じです。', 'Skill choices match the saved contents.')}</p>}
    <p>{t('保存したあと、このモードへ切り替えます。次の新しいタスクから使えます。', 'Save, then switch to this mode for the next new task.')}</p>
    <div className="home-actions"><button type="button" className="primary" disabled={busy} onClick={onConfirm}>{t('保存して切り替える', 'Save and switch')}</button>
      <button type="button" className="secondary" disabled={busy} onClick={onCancel}>{t('やめる', 'Cancel')}</button></div>
  </div>;
}

export function LoadoutEditor({ controller: c, mode, recommendation, onClose, onApplied }: {
  controller: Controller; mode: Exclude<SourceMode, 'normal'>; recommendation: Recommendation;
  onClose: () => void; onApplied: (mode: Exclude<SourceMode, 'normal'>) => void;
}) {
  const source = c.view?.source;
  const [loaded, setLoaded] = useState<{ setup: Read; skills: EditorSkill[]; before: Record<string, LoadoutState>;
    trueform: Record<string, LoadoutState> } | null>(null);
  const [choices, setChoices] = useState<Record<string, LoadoutState>>({});
  const [recommendedIds, setRecommendedIds] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false), [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<{ message: string; detail: string | null } | null>(null);
  const blocked = working || c.busy || !c.confirmed || !source || !!source.conflict || source.recovery.pending;
  useEffect(() => {
    let active = true;
    setLoaded(null); setFailure(null); setConfirm(false);
    void (async () => {
      const setup = await c.executeAuxiliary<Read>('setup', { schemaVersion: 4 });
      if (!active) return;
      if (setup.status !== 'completed' || !setup.result.inventory || setup.result.scopeId !== source?.registration.scopeId
        || setup.result.normalId !== source.registration.activeNormalId || !setup.result.codexOperations) {
        setFailure({ message: t('保存内容を確認できませんでした。', 'Could not check saved settings.'),
          detail: setup.status === 'failed' && setup.error instanceof ApiError ? setup.error.kind : 'setup-unavailable' });
        return;
      }
      const contents = await c.executeAuxiliary<Contents>('mode-contents', {});
      if (!active) return;
      if (contents.status === 'context-updated') return;
      const inventory = setup.result.inventory;
      const names = new Map((source.registration.sources ?? []).map(row => [row.id, row as SourceRow]));
      const skills = inventory.skills.map(skill => ({ ...skill, label: names.get(skill.id)?.label ?? t('登録済みのSkill', 'Registered Skill'),
        description: names.get(skill.id)?.description ?? null }));
      const savedBase = setup.result.proposal?.trueform?.skillStates ?? [];
      const trueform = stateMap(skills.filter(skill => !skill.requiredControl).map(skill => ({ id: skill.id,
        state: savedBase.find(row => row.sourceId === skill.id)?.state ?? (skill.normalState === 'disabled' ? 'disabled' : 'manual') })));
      const savedMode = mode === 'trueform' ? trueform : { ...trueform,
        ...Object.fromEntries((setup.result.proposal?.unseal?.skillElevations ?? []).map(row => [row.sourceId, row.state])) };
      const contentsRows = contents.status === 'completed' && contents.result.modes[mode]?.available
        ? contents.result.modes[mode]!.skills : null;
      const before = contentsRows?.every(row => row.state !== 'unknown')
        ? { ...savedMode, ...stateMap(contentsRows as Array<{ id: string; state: LoadoutState }>) } : savedMode;
      const initial = loadoutInitial({ mode, skills, saved: before, trueform, proposal: recommendation });
      setLoaded({ setup: setup.result, skills, before, trueform });
      setChoices(initial.choices); setRecommendedIds(initial.recommendedIds);
    })();
    return () => { active = false; };
  }, [mode, source?.registration.scopeId, source?.registration.activeNormalId]);
  const changed = loaded ? loadoutChanges({ skills: loaded.skills, before: loaded.before, after: choices }) : [];
  const choiceInvalid = useMemo(() => loaded ? loaded.skills.filter(skill => !skill.requiredControl).some(skill => {
    const base = mode === 'trueform' ? choices[skill.id] : loaded.trueform[skill.id];
    return !loadoutChoices({ mode, skill, trueformState: base, normalEnabled: skill.normalState !== 'disabled',
      codexOperations: loaded.setup.codexOperations ?? normalOperations }).options.some(option => option.state === choices[skill.id] && option.enabled);
  }) : true, [loaded, choices, mode]);
  async function save() {
    if (!loaded || blocked || choiceInvalid || !confirm || !source) return;
    setWorking(true); setFailure(null);
    try {
      const proposal = loadoutProposal({ setup: { ...loaded.setup, inventory: loaded.setup.inventory! },
        mode, choices, sources: source.registration.sources });
      await applyLoadout({ execute: (action, input) => c.executeAuxiliary(action, input), proposal, mode });
      const checked = await c.refresh();
      if (!checked?.source || checked.source.preparedMode !== mode || checked.source.conflict || checked.source.recovery.pending
        || checked.source.registration.modeChangeRequired) throw new ApiError('readback-unconfirmed');
      onApplied(mode);
    } catch (error) {
      await c.refresh();
      const kind = error instanceof ApiError ? error.kind : 'request-failed';
      setFailure({ message: kind === 'codex-version-unqualified' && error instanceof ApiError && error.reason === 'skill-enable'
        ? t('このCodexの版では、このSkillを足すことはまだ確認していません。今の設定はそのままです', 'Adding this Skill has not been checked for this Codex version. Your settings are unchanged.')
        : t('保存と切替を確認できませんでした。状態を再取得して確認してください。', 'Could not confirm saving and switching. Refresh the state to check.'), detail: kind });
      setConfirm(false);
    } finally { setWorking(false); }
  }
  return <section className="loadout-editor" aria-label={t('装備の中身を選ぶ', 'Choose loadout contents')}>
    <header><h2>{mode === 'trueform' ? t('零式の中身を選ぶ', 'Choose TRUEFORM contents') : t('限定解除の中身を選ぶ', 'Choose UNSEAL contents')}</h2>
      <button type="button" className="text-button" disabled={working} onClick={onClose}>{t('閉じる', 'Close')}</button></header>
    <p className="muted">{t('Skillごとの使い方を選びます。保存して切り替えるまでは設定は変わりません。',
      'Choose how each Skill is used. Settings stay unchanged until you save and switch.')}</p>
    {!loaded && !failure && <p role="status">{t('保存内容を確認しています…', 'Checking saved settings…')}</p>}
    {loaded && <>{recommendedIds.length > 0 && <p className="muted">{t('★ AIのおすすめ', '★ AI recommendation')}</p>}
      <LoadoutChoices mode={mode} skills={loaded.skills} choices={choices} trueformStates={loaded.trueform}
      recommendedIds={recommendedIds} codexOperations={loaded.setup.codexOperations ?? normalOperations}
      onChoice={(id, state) => { setChoices(previous => ({ ...previous, [id]: state })); setConfirm(false); }}/>
      <AiRequestButton label={t('AIに意見を聞く', 'Ask AI for an opinion')}
        prompt={bindChatScope(loadoutPrompt({ mode, skills: loaded.skills.filter(skill => !skill.requiredControl), choices }), source?.registration.scopeId)}
        description={null} preview={false}/>
      <button type="button" className="primary" disabled={blocked || choiceInvalid} onClick={() => setConfirm(true)}>
        {t('この内容で保存して切り替える', 'Save and switch with these choices')}</button>
      {choiceInvalid && <p className="muted" role="status">{t('選べない状態を変更してください。', 'Change the unavailable choice before saving.')}</p>}
      {confirm && <LoadoutConfirmation changes={changed} busy={blocked || choiceInvalid}
        onConfirm={() => void save()} onCancel={() => setConfirm(false)}/>}</>}
    {failure && <FailureNotice message={failure.message} detail={failure.detail} scopeId={source?.registration.scopeId}/>}
  </section>;
}
