import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { text as t } from '../locale.ts';
import { Api, ApiError } from '../api.ts';
import { AiRequestButton } from '../AiRequestButton.tsx';
import { bindChatScope } from '../chat-requests.ts';
import { FreshTaskHandoff } from '../SetupHandoff.tsx';
import { modePresentation } from '../sources.ts';
import type { SourceMode, SourcePlan, SourceView } from '../sources.ts';
import type { useSourceController } from '../useSourceController.ts';
import { consultationCopy, homeView, modeChoice, modeForAction, proposalFailureMessage, removedCount, restoreHint } from './home-view.ts';
import type { HomeProposal } from './home-view.ts';
import { ProposalCard } from './ProposalCard.tsx';
import { SwitchSheet } from './SwitchSheet.tsx';
import { FailureNotice } from './FailureNotice.tsx';

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
  const [sheet, setSheet] = useState<Sheet | null>(null), [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null), [success, setSuccess] = useState<SourceMode | null>(null);
  const context = c.view?.metadata.contextId ?? null, latestContext = useRef(context);
  latestContext.current = context;
  const source = c.view?.source ?? null, locked = working || c.busy;
  const proposals = proposalState.context === context ? proposalState.rows : [];
  const view = homeView({ source, confirmed: c.confirmed, busy: locked, proposals, failure: failure?.message ?? null });
  const canPlan = !!source && c.confirmed && !source.recovery.pending && (!source.conflict || source.modePlanningAvailable === true);
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
  useEffect(() => { setSheet(null); setFailure(null); setSuccess(null); }, [context]);
  useEffect(() => { setSheet(null); }, [source?.revision, source?.preparedMode]);
  async function reportFailure(error: unknown, before: SourceView['source'] | null) {
    const checked = await c.refresh();
    const kind = error instanceof ApiError ? error.kind : 'request-failed';
    setFailure({ message: proposalFailureMessage(kind, before, checked?.source ?? null), detail: kind });
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
      if (!checked?.source || checked.source.preparedMode !== target || checked.source.conflict || checked.source.recovery.pending)
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
  return <section className="home-screen" aria-label={t('普段の画面', 'Home')}>
    <div className="home-first">
      <section className="home-current" aria-label={t('今のモード', 'Current mode')}>
        <span>{t('今のモード', 'Current mode')}</span>
        <h1>{view.mode ? modePresentation[view.mode].title : t('確認中', 'Checking')}</h1>
        <p>{view.mode ? modePresentation[view.mode].description : t('今の設定を確かめてから切り替えられます。', 'Check the current settings before switching.')}</p>
        <small>{view.mode ? t('次の新しいタスクから', 'From the next new task') : t('現在のタスクは未確認です', 'The current task is unverified')}</small>
      </section>
      {view.proposal && <ProposalCard proposal={view.proposal}
        sourceNames={Object.fromEntries((source?.registration.sources ?? []).map(row => [row.id, row.label]))}
        busy={locked || !connected}
        onApprove={() => void decide(view.proposal!.proposalId, 'approve')}
        onDismiss={() => void decide(view.proposal!.proposalId, 'dismiss')}/>}
      <div className="home-mode-actions" aria-label={t('使うモードを選ぶ', 'Choose a mode')}>
        {view.switchTargets.map(mode => modeChoice(source, mode) === 'consult'
          ? <div className="home-mode-choice" key={mode}><strong>{modePresentation[mode].title}</strong><p>{modePresentation[mode].description}</p>
              <AiRequestButton label={consultationCopy(mode).label} prompt={bindChatScope(consultationCopy(mode).prompt, source?.registration.scopeId)} preview={false} description={null}/></div>
          : <button className="home-mode-choice" type="button" key={mode} disabled={locked || !canPlan || !!blocker} onClick={() => void openSheet(mode)}>
              <strong>{modePresentation[mode].title}</strong><small>{modePresentation[mode].label}</small><span>{modePresentation[mode].description}</span></button>)}
        <div className="home-restore-choice"><button type="button" className="home-restore" disabled={!view.canRestore} onClick={() => void openSheet(modeForAction('restore'))}>{t('元に戻す', 'Restore Normal')}</button>
          {restoreHint(source) && <small>{restoreHint(source)}</small>}</div>
      </div>
      {blocker && <p className="home-blocker" role="status">{blocker} <button type="button" className="text-button" onClick={onResolve}>{t('確認する', 'Review')}</button></p>}
    </div>
    {sheet && <div className="home-sheet-area">{sheet.removed !== null
      ? <SwitchSheet mode={sheet.mode} removed={sheet.removed} busy={locked} onConfirm={() => void switchMode(sheet.mode)} onCancel={() => setSheet(null)}/>
      : sheet.issue ? <FailureNotice message={t('変更内容を確認できませんでした。', 'Could not check the changes.')} detail={sheet.issue} scopeId={source?.registration.scopeId}/>
        : <p role="status">{t('変更内容を確かめています…', 'Checking changes…')}</p>}</div>}
    {shownFailure && <FailureNotice message={shownFailure.message} detail={shownFailure.detail} scopeId={source?.registration.scopeId}/>}
    {success && <div className="home-success" role="status"><p>{t(`次の新しいタスクから${modePresentation[success].title}です。`, `Use ${modePresentation[success].title} from your next new task.`)}</p>
      {c.view && <FreshTaskHandoff view={c.view} disabled={!c.confirmed} label={t('新しいタスクを始める', 'Start a new task')}/>}</div>}
    <p className="home-usage muted">{t('最近7日の使用量：まだ目安がありません。', 'Last 7 days of usage: no estimate yet.')}</p>
    <section className="home-artwork" aria-label={t('選んだ姿', 'Selected appearance')}>{artwork}</section>
    <div className="home-more-links"><button className="text-button" onClick={onSettings}>{t('設定を見直す', 'Review settings')}</button>
      <button className="text-button" onClick={onSupport}>{t('復旧を開く', 'Open recovery')}</button></div>
  </section>;
}
