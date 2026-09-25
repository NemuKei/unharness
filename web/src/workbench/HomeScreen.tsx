import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { text as t } from '../locale.ts';
import { Api, ApiError } from '../api.ts';
import { bindChatScope } from '../chat-requests.ts';
import { checkInDue } from '../../../src/proposals/check-in-rule.mjs';
import { FreshTaskHandoff } from '../SetupHandoff.tsx';
import { modePresentation } from '../sources.ts';
import type { SourceMode, SourcePlan, SourceView } from '../sources.ts';
import type { useSourceController, AuxiliarySourceOperationResult } from '../useSourceController.ts';
import { homeView, modeChoice, modeForAction, proposalFailureMessage, removedCount, restoreHint, usageDisplay, qualificationNotice } from './home-view.ts';
import type { HomeProposal, HomeUsageSummary } from './home-view.ts';
import { ProposalCard } from './ProposalCard.tsx';
import { SwitchSheet } from './SwitchSheet.tsx';
import { FailureNotice } from './FailureNotice.tsx';
import { CheckInCard } from './CheckInCard.tsx';
import { ReplacedSourcePanel } from './ReplacedSourcePanel.tsx';
import { LoadoutEditor } from './LoadoutEditor.tsx';

type Controller = ReturnType<typeof useSourceController>;
type Contents = { modes: Partial<Record<SourceMode, { available: boolean;
  instructions: { style: string }; skills: { id: string; state: 'automatic' | 'manual' | 'disabled' | 'unknown' }[] }>> };
type Sheet = { mode: SourceMode; removed: number | null; issue: string | null };
type Failure = { message: string; detail: string };

export function HomeScreen({ controller: c, artwork, onSettings, onSupport, onResolve, blocker }: {
  controller: Controller; artwork: ReactNode; onSettings: () => void; onSupport: () => void; onResolve: () => void; blocker: string | null;
}) {
  const api = useRef(new Api()).current;
  const [connected, setConnected] = useState(false);
  const [proposalState, setProposalState] = useState<{ context: string | null; rows: HomeProposal[] }>({ context: null, rows: [] });
  const [usageState, setUsageState] = useState<{ context: string | null; summary: HomeUsageSummary | null }>({ context: null, summary: null });
  const [taskCount, setTaskCount] = useState<{ proposalId: string; count: number } | null>(null);
  const [answered, setAnswered] = useState<Set<string>>(() => {
    try { const value = JSON.parse(sessionStorage.getItem('unharness.check-in.v1') ?? '[]');
      return new Set(Array.isArray(value) ? value.filter(id => typeof id === 'string') : []); } catch { return new Set(); }
  });
  const [checkInCopy, setCheckInCopy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null), [working, setWorking] = useState(false);
  const [editorMode, setEditorMode] = useState<'trueform' | 'unseal' | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null), [success, setSuccess] = useState<SourceMode | null>(null);
  const context = c.view?.metadata.contextId ?? null, latestContext = useRef(context);
  latestContext.current = context;
  const source = c.view?.source ?? null, locked = working || c.busy;
  const replaced = !source?.recovery.pending && source?.conflict?.kind === 'source-replaced'
    && source.conflict.sourceId && source.conflict.label
    ? { sourceId: source.conflict.sourceId, label: source.conflict.label } : null;
  const proposals = proposalState.context === context ? proposalState.rows : [];
  const usage = usageState.context === context ? usageState.summary : null;
  const usageText = usageDisplay(usage);
  const view = homeView({ source, confirmed: c.confirmed, busy: locked, proposals, failure: failure?.message ?? null });
  const reprepareNeedsSetup = view.reprepareMode !== null && view.reprepareMode !== 'normal' && !source?.setup?.setupId;
  const canPlan = !!source && c.confirmed && !source.recovery.pending && (!source.conflict || source.modePlanningAvailable === true);
  const added = !replaced && !view.reprepareMode && source?.preparedMode === 'unseal' && source.preparation && !source.conflict
    ? proposals.find(p => p.kind === 'add' && p.status === 'applied' && p.result?.revision === source.revision) : null;
  const addedAt = added && source?.preparation?.preparedAt;
  useEffect(() => { let active = true; void api.connect().then(() => { if (active) setConnected(true); }).catch(() => {
    if (active) setConnected(false);
  }); return () => { active = false; }; }, [api]);
  async function loadProposals(acceptedContext: string | null) {
    if (!acceptedContext) { setProposalState({ context: null, rows: [] }); return; }
    try {
      const response = await api.get<{ proposals: HomeProposal[] }>('/sources/proposals');
      if (latestContext.current === acceptedContext) setProposalState({ context: acceptedContext,
        rows: Array.isArray(response.proposals) ? response.proposals : [] });
    } catch { if (latestContext.current === acceptedContext) setProposalState({ context: acceptedContext, rows: [] }); }
  }
  useEffect(() => {
    if (!connected) return;
    void loadProposals(context);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void loadProposals(context); }, 3000);
    return () => window.clearInterval(timer);
  }, [connected, context, source?.revision]);
  useEffect(() => {
    if (!connected || !context) return;
    let active = true;
    const load = async () => { try {
      const summary = await api.get<HomeUsageSummary>('/sources/usage');
      if (active && latestContext.current === context) setUsageState({ context, summary });
    } catch { if (active && latestContext.current === context) setUsageState({ context, summary: null }); } };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, [connected, context, source?.revision]);
  useEffect(() => {
    if (!added || !addedAt) { setTaskCount(null); return; }
    let active = true;
    void (async () => {
      let cursor: string | null = null, count = 0;
      const seen = new Set<string>();
      for (let page = 0; page < 50 && count < 5; page++) {
        const response: AuxiliarySourceOperationResult<{ available: boolean; tasks: { createdAt: number }[]; nextCursor: string | null }> = await c.executeAuxiliary<{
          available: boolean; tasks: { createdAt: number }[]; nextCursor: string | null }>(
          'recent-tasks', cursor ? { taskCursor: cursor } : {});
        if (!active || response.status !== 'completed' || !response.result.available) return;
        count += response.result.tasks.filter(task => Number.isSafeInteger(task.createdAt)
          && task.createdAt * 1000 >= Date.parse(addedAt)).length;
        cursor = response.result.nextCursor;
        if (!cursor || seen.has(cursor)) break;
        seen.add(cursor);
      }
      if (active) setTaskCount({ proposalId: added.proposalId, count });
    })();
    return () => { active = false; };
  }, [added?.proposalId, addedAt, context]);
  useEffect(() => { setSheet(null); setEditorMode(null); setFailure(null); setSuccess(null); }, [context]);
  useEffect(() => { setSheet(null); }, [source?.revision, source?.preparedMode]);
  async function reportFailure(error: unknown, before: SourceView['source'] | null) {
    const checked = await c.refresh();
    const kind = error instanceof ApiError ? error.kind : 'request-failed';
    setFailure({ message: proposalFailureMessage(kind, before, checked?.source ?? null,
      error instanceof ApiError ? error.reason : undefined), detail: kind });
    setSuccess(null);
    await loadProposals(context);
  }
  async function openSheet(mode: SourceMode) {
    if (locked || !source || !canPlan) return;
    setFailure(null);
    setSheet({ mode, removed: null, issue: null });
    const response = await c.executeAuxiliary<Contents>('mode-contents', {});
    const count = response.status === 'completed' ? removedCount(response.result, source.preparedMode, mode) : null;
    if (latestContext.current !== context) return;
    setSheet({ mode, removed: count, issue: count === null
      ? response.status === 'failed' && response.error instanceof ApiError ? response.error.kind : 'mode-contents-unavailable' : null });
  }
  function openEditor(mode: 'trueform' | 'unseal') {
    if (locked || !source || !canPlan) return;
    setSheet(null); setFailure(null); setEditorMode(mode);
  }
  async function switchMode(mode: SourceMode) {
    if (locked || !source || !c.confirmed || !sheet || sheet.removed === null) return;
    const before = source;
    setWorking(true); setFailure(null); setSuccess(null);
    try {
      const target = modeForAction(mode);
      const planned = await c.executeAuxiliary<SourcePlan>('plan', { mode: target });
      if (planned.status !== 'completed' || planned.result.mode !== target) throw planned.status === 'failed' ? planned.error : new ApiError('gui-source-context-changed');
      const applied = await c.executeAuxiliary<{ preparedMode: SourceMode; readback: string }>('apply', { planId: planned.result.planId });
      if (applied.status !== 'completed' || applied.result.preparedMode !== target || applied.result.readback !== 'matched')
        throw applied.status === 'failed' ? applied.error : new ApiError('gui-source-context-changed');
      const checked = await c.refresh();
      if (!checked?.source || checked.source.preparedMode !== target || checked.source.conflict || checked.source.recovery.pending
        || checked.source.registration.modeChangeRequired)
        throw new ApiError('readback-unconfirmed');
      setSheet(null); setSuccess(target);
      await loadProposals(context);
    } catch (error) { setSheet(null); await reportFailure(error, before); }
    finally { setWorking(false); }
  }
  async function decide(proposalId: string, decision: 'approve' | 'dismiss') {
    if (locked || !c.view) return;
    const before = source;
    setWorking(true); setFailure(null); setSuccess(null);
    try {
      const result = await api.post<HomeProposal>('/sources/decide-proposal', {
        launchId: c.view.metadata.launchId, contextId: c.view.metadata.contextId, proposalId, decision });
      if (decision === 'approve' && result.status !== 'applied' || decision === 'dismiss' && result.status !== 'dismissed')
        throw new ApiError('invalid-response');
      const checked = await c.refresh();
      if (decision === 'approve' && checked?.source && !checked.source.conflict && !checked.source.recovery.pending)
        setSuccess(checked.source.preparedMode);
      await loadProposals(context);
    } catch (error) { await reportFailure(error, before); }
    finally { setWorking(false); }
  }
  const externalFailure = !failure && c.error ? { message: c.error, detail: c.errorDetail } : null;
  const shownFailure = failure ?? externalFailure;
  function markAnswered(proposalId: string) {
    const next = new Set(answered); next.add(proposalId); setAnswered(next);
    try { sessionStorage.setItem('unharness.check-in.v1', JSON.stringify([...next])); } catch {}
  }
  async function copyCheckIn(proposalId: string, prompt: string) {
    try { await navigator.clipboard.writeText(bindChatScope(prompt, source?.registration.scopeId));
      setCheckInCopy(null); markAnswered(proposalId); }
    catch { setCheckInCopy(prompt); }
  }
  const addedName = added?.items.map(item => source?.registration.sources.find(row => row.id === item.sourceId)?.label)
    .filter((name): name is string => !!name).join('・') || t('追加したSkill', 'Added Skill');
  return <section className="home-screen" aria-label={t('普段の画面', 'Home')}>
    <div className="home-first">
      {qualificationNotice(source?.registration.codexQualificationStatus, working) &&
        <p role="status">{qualificationNotice(source?.registration.codexQualificationStatus, working)}</p>}
      <section className="home-current" aria-label={t('今のモード', 'Current mode')}>
        <span>{t('今のモード', 'Current mode')}</span>
        <h1>{view.mode ? modePresentation[view.mode].title : t('確認中', 'Checking')}</h1>
        <p>{view.mode ? modePresentation[view.mode].description : t('今の設定を確かめてから切り替えられます。', 'Check the current settings before switching.')}</p>
        <small>{view.reprepareMode ? t('準備し直しが必要です', 'Needs to be prepared again')
          : view.mode ? t('次の新しいタスクから', 'From the next new task') : t('現在のタスクは未確認です', 'The current task is unverified')}</small>
      </section>
      {!shownFailure && view.notice && !editorMode && <p className="home-next" role="status">{view.notice}</p>}
      {replaced && <ReplacedSourcePanel controller={c} sourceId={replaced.sourceId} label={replaced.label}/>}
      {view.reprepareMode && !editorMode && <section className="home-reprepare" role="status"><p>{t(`${modePresentation[view.reprepareMode].title}を準備し直してください`,
        `Prepare ${modePresentation[view.reprepareMode].title} again`)}</p>
        {reprepareNeedsSetup ? <button type="button" className="primary" disabled={locked} onClick={() => openEditor(view.reprepareMode! as 'trueform' | 'unseal')}>
          {t(`${modePresentation[view.reprepareMode].title}の中身を選ぶ`, `Choose ${modePresentation[view.reprepareMode].title} contents`)}</button>
          : <button type="button" className="primary" disabled={locked || !canPlan} onClick={() => void openSheet(view.reprepareMode!)}>{t('準備し直す', 'Prepare again')}</button>}</section>}
      {view.proposal && !editorMode && <ProposalCard proposal={view.proposal}
        sourceNames={Object.fromEntries((source?.registration.sources ?? []).map(row => [row.id, row.label]))}
        busy={locked || !connected}
        onApprove={() => void decide(view.proposal!.proposalId, 'approve')}
        onDismiss={() => void decide(view.proposal!.proposalId, 'dismiss')}/>}
      {!replaced && !view.reprepareMode && !editorMode && <div className="home-mode-actions" aria-label={t('使うモードを選ぶ', 'Choose a mode')}>
        {view.switchTargets.map(mode => <div className="home-mode-choice" key={mode}>
          <strong>{modePresentation[mode].title}</strong><small>{modePresentation[mode].label}</small><span>{modePresentation[mode].description}</span>
          <div className="home-actions">{modeChoice(source, mode) === 'switch' && <button type="button" className="secondary"
            disabled={locked || !canPlan || !!blocker} onClick={() => void openSheet(mode)}>{t('切り替える', 'Switch')}</button>}
            <button type="button" className="secondary" disabled={locked || !canPlan} onClick={() => openEditor(mode)}>
              {t(`${modePresentation[mode].title}の中身を選ぶ`, `Choose ${modePresentation[mode].title} contents`)}</button></div>
        </div>)}
        <div className="home-restore-choice"><button type="button" className="home-restore" disabled={!view.canRestore} onClick={() => void openSheet(modeForAction('restore'))}>{t('元に戻す', 'Restore Normal')}</button>
          {restoreHint(source) && <small>{restoreHint(source)}</small>}</div>
      </div>}
      {blocker && !replaced && !view.reprepareMode && !view.notice && !editorMode && <p className="home-blocker" role="status">{blocker} <button type="button" className="text-button" onClick={onResolve}>{t('確認する', 'Review')}</button></p>}
    </div>
    {editorMode && <div className="home-sheet-area"><LoadoutEditor controller={c} mode={editorMode}
      recommendation={view.proposal?.mode === editorMode ? view.proposal : null}
      onClose={() => setEditorMode(null)} onApplied={mode => { setEditorMode(null); setSuccess(mode); void loadProposals(context); }}/></div>}
    {sheet && <div className="home-sheet-area">{sheet.removed !== null
      ? <SwitchSheet mode={sheet.mode} removed={sheet.removed} busy={locked} onConfirm={() => void switchMode(sheet.mode)} onCancel={() => setSheet(null)}/>
      : sheet.issue ? <FailureNotice message={t('変更内容を確認できませんでした。', 'Could not check the changes.')} detail={sheet.issue} scopeId={source?.registration.scopeId}/>
        : <p role="status">{t('変更内容を確かめています…', 'Checking changes…')}</p>}</div>}
    {shownFailure && <FailureNotice message={shownFailure.message} detail={shownFailure.detail} scopeId={source?.registration.scopeId}/>}
    {success && <div className="home-success" role="status"><p>{t(`次の新しいタスクから${modePresentation[success].title}です。`, `Use ${modePresentation[success].title} from your next new task.`)}</p>
      {c.view && <FreshTaskHandoff view={c.view} disabled={!c.confirmed} label={t('新しいタスクを始める', 'Start a new task')}/>}</div>}
    {added && addedAt && <CheckInCard name={addedName}
      due={checkInDue({ addedAt, tasksSince: taskCount?.proposalId === added.proposalId ? taskCount.count : 0, now: new Date().toISOString() })}
      answered={answered.has(added.proposalId)} ratio={usage?.ratioToTrueform.unseal ?? null}
      onKeep={() => markAnswered(added.proposalId)}
      onRemove={() => void copyCheckIn(added.proposalId, t('Unharnessで追加したSkillを外す提案をしてください。今の構成を読み、理由と元に戻す方法を示してください。まだ設定を変えないでください。',
        'Propose removing the added Skill from Unharness. Review the current setup, explain why and how to return, and do not change settings yet.'))}
      onConsult={() => void copyCheckIn(added.proposalId, t('Unharnessで追加したSkillを残すか相談したいです。最近の使い方と使用量の目安を見て、理由つきで提案してください。まだ設定を変えないでください。',
        'Help me decide whether to keep the added Skill. Consider recent work and available usage estimates, explain your reasons, and do not change settings yet.'))}/>}
    {checkInCopy && <details open><summary>{t('依頼文を確認', 'Review request')}</summary><textarea readOnly value={checkInCopy}/></details>}
    <div className="home-usage muted"><p>{t('最近7日の使用量：', 'Last 7 days of usage: ')}{usageText.message}</p>
      <p>{t('仕事の内容が違うため、性能差を示すものではありません。', 'Different work can affect usage; this is not a performance claim.')}</p>
      {usageText.details.length > 0 && <details><summary>{t('詳しく', 'Details')}</summary><ul>{usageText.details.map(row => <li key={row}>{row}</li>)}</ul></details>}</div>
    <section className="home-artwork" aria-label={t('選んだ姿', 'Selected appearance')}>{artwork}</section>
    <div className="home-more-links"><button className="text-button" onClick={onSettings}>{t('設定を見直す', 'Review settings')}</button>
      <button className="text-button" onClick={onSupport}>{t('復旧を開く', 'Open recovery')}</button></div>
  </section>;
}
