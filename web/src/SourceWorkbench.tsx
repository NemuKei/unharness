import { text as t } from './locale.ts';
import { LanguageSwitch } from './LanguageSwitch';
import { getLocale } from './locale.ts';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hangar } from "./Hangar";
import { WorkbenchNavigation, workbenchPageFromHash } from "./WorkbenchNavigation";
import type { WorkbenchPage } from "./WorkbenchNavigation";
import { ModeActions, InstructionScopeNote } from "./ModeActions";
import { modeBlocker } from "./mode-blocker";
import { AiRequestButton, stateCheckPrompt } from "./AiRequestButton";
import { bindChatScope, modeChatRequest } from './chat-requests';
import "./workbench.css";
import { ComparisonWorkbench } from "./ComparisonWorkbench";
import { SetupHandoff, FreshTaskHandoff } from "./SetupHandoff";
import { releaseModeDescription } from "./setup";
import { EnrollmentPanel } from "./EnrollmentPanel";
import { PluginEnrollmentPanel } from './PluginEnrollmentPanel';
import { SourceStateEditor } from './SourceStateEditor';
import { PluginObservationSummary } from './PluginObservationSummary';
import { LocalConnectionPanel } from "./LocalConnectionPanel";
import { useLocalAppearance } from './useLocalAppearance';
import { AppearancePanel } from './AppearancePanel';
import type { ArtworkImageLoader } from './artwork';
import {
  RestoreAdaptationNotice,
  RetainedReview,
} from "./components/RetainedReview";
import { useSourceController } from "./useSourceController";
import { comparisonContextKey } from "./useComparisonController";
import {
  canObserveTask,
  currentTaskObservation,
  isClaudeContext,
  modePresentation,
  observationIssueText,
  sourceHomeOf,
  sourceModes,
  sourceRuntimeOf,
  taskObservationLabel,
  validTaskId,
} from "./sources";
import type {
  SourceMode,
  SourceRow,
  SourcePlan,
  TaskObservation,
} from "./sources";
import "./sources.css";

function displayPreference() {
  try {
    return localStorage.getItem("unharness.effects.v1") !== "off";
  } catch {
    return false;
  }
}
export function SourceWorkbench() {
  const c = useSourceController();
  const art = useLocalAppearance(c), artwork = art.view?.selectedItem ?? null;
  const imageLoader = useMemo<ArtworkImageLoader | undefined>(() => artwork?.kind === 'layered'
    ? (asset, signal) => art.image(artwork.id, asset, signal, art.key) : undefined, [art.key, artwork?.id, art.image]);
  const [effects, setEffects] = useState(displayPreference);
  const [activeTab, setActiveTab] = useState<WorkbenchPage>(() => workbenchPageFromHash(location.hash) ?? 'mode');
  const initialContext = useRef<{ id: string; registered: boolean } | null>(null);
  const showConnection = useCallback(() => setActiveTab('support'), []);
  useEffect(() => {
    const changed = (event: HashChangeEvent) => { const page = workbenchPageFromHash(new URL(event.newURL).hash); if (page) setActiveTab(page); };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  const [comparisonTask, setComparisonTask] = useState<{
    taskId: string;
    contextKey: string;
  } | null>(null);
  const source = c.view?.source;
  const presentation = { ...modePresentation[c.selected], description:
    releaseModeDescription(c.selected, c.plan ? c.plan.setupId : source?.setup?.setupId,
      c.plan && c.plan.setupId !== source?.setup?.setupId ? undefined : source?.setup?.schemaVersion) ?? modePresentation[c.selected].description };
  const comparisonKey = comparisonContextKey(c.view);
  const usable =
    !!source &&
    c.confirmed &&
    !source.conflict &&
    !source.recovery.pending &&
    !c.busy;
  useEffect(() => {
    if (!c.view || !c.confirmed) return;
    const id = c.view.metadata.contextId, registered = !!c.view.source;
    if (!registered) setActiveTab('settings');
    else if (initialContext.current && !initialContext.current.registered) setActiveTab('mode');
    initialContext.current = { id, registered };
  }, [c.view?.metadata.contextId, !!source, c.confirmed]);
  const blocker = modeBlocker({ busy: c.busy, connected: true, confirmed: c.confirmed,
    registered: !!source, conflict: !!source?.conflict, recoveryPending: !!source?.recovery.pending,
    setupRequired: !!source?.setup?.setupRequired }, c.selected);
  const modeNotice = ['状態を再取得しました。実行中のタスクは未検証です。', '接続情報を確認しています。', 'State refreshed. The running task is unverified.', 'Checking the connection.'].includes(c.notice) ? undefined : c.notice;
  const resolveBlocker = blocker && blocker.kind !== 'busy' ? <>
    {blocker.kind === 'refresh' ? <button className="secondary" onClick={() => void c.refresh()}>{t("もう一度状態を確認", "Read the state again")}</button>
      : blocker.kind === 'initial' || blocker.kind === 'settings'
        ? <button className="secondary" onClick={() => setActiveTab('settings')}>{blocker.kind === 'initial' ? t("初期設定へ", "Open initial setup") : t("設定を見直す", "Review settings")}</button>
        : <button className="secondary" onClick={() => setActiveTab('support')}>{blocker.kind === 'recovery' ? t("このMacで復旧する", "Recover on this Mac") : t("このMacで差分を確認する", "Review local differences")}</button>}
    {['changes', 'recovery', 'refresh', 'operation'].includes(blocker.kind) && <AiRequestButton label={t("状態の確認をAIに頼む", "Ask AI to check the state")} prompt={bindChatScope(stateCheckPrompt(), source?.registration.scopeId)} recipient={c.view?.metadata.application === 'claude' ? 'Claude Code' : 'Codex'}/>}
  </> : null;
  return <div className="app-shell source-workbench">
      <header className="topbar">
        <a className="wordmark" href="#main">
          UNHARNESS<span>{t("装備を見直す。", "Find your fit.")}</span>
        </a>
        <div className="header-right"><LanguageSwitch/>
          <span className="scope-label">
            {source ? t("登録した追加設定", "Registered optional settings") : t("追加設定の確認", "Review optional settings")}
          </span>
          <label className="effects">
            <input
              type="checkbox"
              checked={effects}
              onChange={(e) => {
                setEffects(e.target.checked);
                try {
                  localStorage.setItem(
                    "unharness.effects.v1",
                    e.target.checked ? "on" : "off",
                  );
                } catch {}
              }}
            />
            {t("演出 ", "Animation ")}<span>{effects ? "ON" : "OFF"}</span>
          </label>
        </div>
      </header>
    <WorkbenchNavigation page={activeTab} select={setActiveTab}/>
    <div className="workbench-place"><p>{t("このMacの画面です。対象確認・接続許可・復旧をここで行い、オフラインでも操作できます。", "This is your local Mac workbench. Review targets, approve connections and recover here, including offline.")}</p>
      <button className="text-button" disabled={c.busy} onClick={() => void c.refresh()}>{t("状態を再取得", "Refresh state")}</button></div>
    {c.syncNotice && c.syncIssue && <p className="source-sync-notice muted" role="status">{c.syncNotice}</p>}
    <main id="main">
      <div hidden={activeTab !== 'mode'}>
        <div className="hangar-layout">
          <section className="visual-column" aria-label={t("選択したモード", "Selected mode")}>
            <div className="scene-heading"><p className="eyebrow">{t("モード ／ 選択プレビュー", "MODE / PREVIEW")}</p>
              <h1>{presentation.title}</h1><p className="scene-subtitle">{presentation.label}</p></div>
            {activeTab === 'mode' && <Hangar condition={presentation.scene} effects={effects} artwork={artwork} imageLoader={imageLoader} locale={getLocale()}/>}
            <p className="scene-caption">{t("選択したモードの姿です。確定するまで設定は変わりません。", "Preview of the selected mode. Settings stay unchanged until you apply it.")}</p>
          </section>
          <aside className="control-column" aria-label={t("設定と保存", "Settings and saved versions")}>
            <section className="mode-current control-section"><div className="section-heading"><h2>{t("現在の準備", "Currently prepared")}</h2></div>
              <p className="selected-name">{source ? modePresentation[source.preparedMode].title : c.confirmed ? t("通常装備はまだ保存されていません", "Normal has not been saved yet") : t("確認中", "Checking")}</p>
              {source && (!c.confirmed || source.conflict || source.recovery.pending) && <p className="muted">{t("前回確認した構成です。現在の状態を確認してください。", "This is the last confirmed loadout. Check the current state.")}</p>}
              {source?.registration.modeChangeRequired && <p className="scope-enrollment-notice" role="status">{t("登録が更新されました。次のタスク用の設定を、まだ準備していません。", "Registration changed. Settings for the next task have not been prepared yet. ")}{source.setup?.setupRequired ? t("先に「設定をAIと見直す」で両モードの構成を確認・保存してください。Normalと過去の保存版には戻せます。", "Use Review settings with AI to review and save both modes first. Normal and earlier saved versions remain available.") : t("使うモードを選び、変更内容を確認してください。", "Select a mode and review its changes.")}</p>}
            </section>
            <InstructionScopeNote application={c.view?.metadata.application} compact/>
            <ModeChoices key={c.selectionKey + ':' + (source?.registration.normalId ?? 'setup') + ':' + (source?.setup?.setupId ?? 'legacy')} controller={c} usable={usable}/>
            <ModeActions title={presentation.title} blocker={blocker} planReady={!!c.plan && c.plan.preparedMode === c.selected}
              review={() => c.choose(c.selected)} confirm={() => { if (usable && c.plan) void c.run('apply', { planId: c.plan.planId }); }} resolve={resolveBlocker} statusMessage={activeTab === 'mode' ? modeNotice : undefined}>
                  {c.plan && source ? (
                    <>
                      <p className="mode-plan-description">{presentation.description}</p>
                      {c.plan.adaptation && (
                        <RestoreAdaptationNotice
                          adaptation={c.plan.adaptation}
                        />
                      )}
                      {!c.plan.changedFiles.length && (
                        <p className="muted">
                          {t("ファイル内容の変更はありません。", "No file-content changes.")}</p>
                      )}
                      <p className="muted">
                        {t("変更するファイル ", "Files to change: ")}{c.plan.changedFiles.length}{" "}
                        {t("件。未選択の設定は通常装備の内容を維持します。", ". Unselected settings keep their Normal values.")}</p>
                      <details>
                        <summary>{t("変更する項目を確認", "Review changed items")}</summary>
                        <ul className="source-changes">{c.plan.changedFiles.map(file => <li key={file.id}>{file.label}</li>)}</ul>
                        <code>{c.plan.planId}</code>
                        {c.plan.skillStates.map((row) => (
                          <p key={row.id}>
                            {
                              source.registration.sources.find(
                                (s) => s.id === row.id,
                              )?.label
                            }
                            :{" "}
                            {row.enabled
                              ? row.manualOnly
                                ? t("手動のみ", "Explicit use only")
                                : t("有効", "Enabled")
                              : t("無効", "Disabled")}
                          </p>
                        ))}
                        {(c.plan.pluginStates ?? []).map(row => <p key={row.pluginId}>
                          {source.registration.plugins?.find(p => p.id === row.pluginId)?.label ?? row.pluginId}：
                          {row.state === 'disabled' ? t("プラグイン全体を無効にする設定", "Disable the whole plugin") : row.enabled ? t("Normalを保持（有効）", "Keep Normal (enabled)") : t("Normalを保持（無効）", "Keep Normal (disabled)")}
                        </p>)}
                        {!!c.plan.pluginStates?.length && <p className="muted">{t("プラグイン全体の設定を準備します。各機能が新しいタスクでどう読み込まれたかは、別に確認します。", "Prepares the whole-plugin setting. Verify individual capabilities in a fresh task separately.")}</p>}
                      </details>
                    </>
                  ) : (
                    <p className="muted">
                      {t("モードまたは保存版を選び、変更計画を確認してください。", "Select a mode or saved version and review the change plan.")}</p>
                  )}
            </ModeActions>
            {!blocker && <details className="chat-mode-entry"><summary>{t("チャットでこのモードを頼む", "Ask for this mode in chat")}</summary><AiRequestButton label={t("切替の依頼文をコピー", "Copy mode request")} prompt={bindChatScope(modeChatRequest(c.selected), source?.registration.scopeId)}/></details>}
            {c.view && source && <FreshTaskHandoff view={c.view} disabled={!usable || !!source.registration.modeChangeRequired}/>}
            <button className="text-button" onClick={() => setActiveTab('settings')}>{t("各モードの指示・Skillを見直す", "Review each mode's instructions and Skills")}</button>
          </aside>
        </div>
      </div>
      <section className="workbench-pane" hidden={activeTab !== 'settings'} aria-label={t("設定の見直し", "Review settings")}>
        {c.view ? <SetupHandoff key={c.view.metadata.contextId + ':' + (source?.setup?.setupId ?? 'initial')}
          view={c.view} confirmed={c.confirmed} busy={c.busy} execute={c.executeAuxiliary}/>
          : <p>{t("状態を確認しています。", "Checking the state.")}</p>}
        {!source ? <details className="settings-manual"><summary>{t("このMacで対象を確認・登録する", "Review and register targets on this Mac")}</summary><Setup key={c.selectionKey} controller={c}/></details>
          : <details className="settings-manual"><summary>{t("このMacで構成と対象を確認・編集する", "Review and edit local loadouts and targets")}</summary>
            <div className="saved-mode-settings">{source.setup?.schemaVersion === 3 && source.setup.setupId && (['unseal', 'trueform'] as const).map(mode =>
              <div data-mode={mode} key={mode}><SourceStateEditor key={c.view!.metadata.contextId + ':' + source.revision + ':' + mode} controller={c} mode={mode}/></div>)}</div>
            <EnrollmentPanel key={c.view?.metadata.contextId + ':' + source.revision} controller={c}/>
            <PluginEnrollmentPanel key={c.view?.metadata.contextId + ':plugins:' + source.revision} controller={c}/>
          </details>}
        <InstructionScopeNote application={c.view?.metadata.application}/>
      </section>
      <section className="workbench-pane appearance-workbench" hidden={activeTab !== 'appearance'} aria-label={t("外観の変更", "Change appearance")}>
        <h1>{t("外観", "Appearance")}</h1><p>{t("好きな姿で使えます。指示・Skillの構成や性能の評価は変わりません。", "Choose any look. Instructions, Skills and performance assessments stay unchanged.")}</p>
        <div className="appearance-workbench-layout">{activeTab === 'appearance' && <Hangar condition={presentation.scene} effects={effects} artwork={artwork} imageLoader={imageLoader} locale={getLocale()}/>}
          {source ? <AppearancePanel controller={art}/> : <div><p>{t("外観の保存には、対象の確認とNormalの保存が必要です。", "Review the targets and save Normal before saving artwork.")}</p><button className="secondary" onClick={() => setActiveTab('settings')}>{t("初期設定へ", "Open initial setup")}</button></div>}</div>
      </section>
      <section hidden={activeTab !== 'history'} className="workbench-pane" aria-label={t("比較と記録", "Comparisons and records")}>
        <ComparisonWorkbench key={comparisonKey} sourceController={c} taskHandoff={comparisonTask?.contextKey === comparisonKey ? comparisonTask : undefined}/>
        {source && <Save controller={c} usable={usable && !source.registration.modeChangeRequired}/>}
      </section>
      <section hidden={activeTab !== 'support'} className="workbench-pane" aria-label={t("このMacの接続と復旧", "Connection and recovery on this Mac")}>
        <h1>{t("接続・復旧", "Connection & recovery")}</h1>
        <p>{t("接続許可や手元のファイルの確認を行います。完了したら「モード」に戻って操作できます。", "Review connection permissions and local files. Return to Mode when finished.")}</p>
        {c.view?.source && <LocalConnectionPanel key={c.view.metadata.launchId + ':' + c.view.metadata.contextId + ':' + c.view.source.registration.scopeId}
          view={c.view} enabled={c.confirmed && !c.busy} request={c.requestConnection} onOpen={showConnection}/>}
        <div className="support-state">
            <section className="control-section">
              <div className="section-heading">
                <h2>{t("現在の準備", "Currently prepared")}</h2>
                <span>
                  {source &&
                  c.confirmed &&
                  !source.conflict &&
                  !source.recovery.pending &&
                  !source.registration.modeChangeRequired
                    ? t("準備済み", "Prepared")
                    : source
                      ? t("要確認", "Review needed")
                      : t("未登録", "Not registered")}
                </span>
              </div>
              <p className="selected-name">
                {source?.recovery.pending
                  ? t("変更が中断しています", "A change was interrupted")
                  : source
                    ? t(`${source.registration.modeChangeRequired ? "登録変更前の最後の準備：" : !c.confirmed || source.conflict ? "最後に確認した保存状態：" : ""}${modePresentation[source.preparedMode].title}`, `${source.registration.modeChangeRequired ? 'Last preparation before registration changed: ' : !c.confirmed || source.conflict ? 'Last checked saved state: ' : ''}${modePresentation[source.preparedMode].title}`)
                    : t("通常装備はまだ保存されていません", "Normal has not been saved yet")}
              </p>
              <p className="boundary">
                {source?.recovery.pending
                  ? t("現在のファイル状態は未確認です。下の「中断した変更を復旧」で、記録に基づく復旧を行ってください。", "Current files are unconfirmed. Use Recover interrupted changes below to recover from the saved journal.")
                  : source
                    ? t("ファイルの準備と、タスクへの読み込みは別です。使用時は新しいタスクを作成してください。", "File preparation and task loading are separate. Create a fresh task to use the loadout.")
                    : t("対象を確認し、追加した任意の指示・Skillだけを選んで保存します。", "Review the targets and save only the optional instructions and Skills you added.")}
              </p>
              {source?.conflict &&
                (source.recovery.pending ? (
                  <details>
                    <summary>{t("現在の確認結果", "Current evidence")}</summary>
                    <p>
                      {t("確認できない状態：", "Unconfirmed state: ")}{source.conflict.kind}
                      {t("。独立した編集がある場合、復旧は上書きせず停止します。", ". Recovery stops if independent edits are present.")}</p>
                  </details>
                ) : (
                  <div className="retained-conflict">
                    <p role="alert">
                      {t("外部の変更を確認してください（", "Review external changes (")}{source.conflict.kind}）。
                    </p>
                    <button
                      className="secondary"
                      disabled={c.busy || !c.confirmed}
                      onClick={() =>
                        void c.run("plan-retained", {}, c.setRetainedPlan)
                      }
                    >
                      {t("変更を確認", "Review changes")}</button>
                    {c.retainedPlan && (
                      <RetainedReview
                        plan={c.retainedPlan}
                        disabled={c.busy || !c.confirmed}
                        onAccept={() =>
                          void c.run("accept-retained", {
                            planId: c.retainedPlan!.planId,
                          })
                        }
                      />
                    )}
                  </div>
                ))}
              {source && (
                <TaskObservationSection
                  controller={c}
                  usable={usable}
                  onCompareTask={(taskId) => {
                    setComparisonTask({ taskId, contextKey: comparisonKey });
                    setActiveTab("history");
                  }}
                />
              )}
            </section>
        </div>
        <details className="developer-details">
          <summary>{t("対象・保持する設定・対応状況", "Targets, retained settings and support")}</summary>
          <Context controller={c} />
          <p>
            {t("メモリ、タスク継続、実行権限、プロジェクト要件、提供元・管理者の設定、未選択のソースは保持します。", "Memory, task continuity, permissions, project requirements, provider and managed settings, and unselected sources are retained.")}</p>
          <p>
            {t("フックは変更しません。Windowsの実設定書き込みとデスクトップ読み込みは未検証です。", "Hooks stay unchanged. Windows personal-setting writes and Desktop loading remain unverified.")}</p>
          {source?.registration.sources.map((row) => (
            <SourceDetail key={row.id} row={row} controller={c} />
          ))}
        </details>
      </section>
      <div hidden={activeTab !== 'history' && activeTab !== 'support'} className="workbench-pane workbench-records">
        <div className="records-grid">
          <section className="control-section">
            <div className="section-heading">
              <h2>{t("お気に入り", "Favorites")}</h2>
              <span>{t("内容を保存した版", "Versioned configurations")}</span>
            </div>
            <p className="muted">{t("保存した時点の構成へ戻せます。旧規則の保存版も、現在の零式の選択で置き換えません。", "Return to a configuration as it was saved. Older versions are not rewritten to match current TRUEFORM choices.")}</p>
            <button
              className="secondary"
              disabled={!source || c.busy}
              onClick={() => c.loadFavorites()}
            >
              {t("保存版を表示", "Show saved version")}</button>
            <ul className="source-favorites">
              {c.favorites.map((f) => (
                <li key={f.favoriteId}>
                  <button
                    className="secondary"
                    disabled={!usable}
                    onClick={() => {
                      setActiveTab('mode');
                      void c.run<SourcePlan>(
                        "favorite",
                        { favoriteId: f.favoriteId },
                        c.setPlan,
                      );
                    }}
                  >
                    {f.name} · {modePresentation[f.preparedMode].title}
                    {f.addedPluginIds?.length ? t(` · 追加したプラグイン ${f.addedPluginIds.length}件はNormal`, ` · ${f.addedPluginIds.length} added plugins use Normal`) : ''}
                    {f.addedSourceIds?.length ? t(` · 追加したSkill ${f.addedSourceIds.length}件を含む`, ` · Includes ${f.addedSourceIds.length} added Skills`) : source &&
                    f.normalId !== source.registration.activeNormalId
                      ? t(" · 現在の共通設定を維持", " · Current retained settings preserved")
                      : ""}
                  </button>
                </li>
              ))}
            </ul>
            {c.cursor && (
              <button
                className="text-button"
                disabled={c.busy}
                onClick={() => c.loadFavorites(c.cursor!)}
              >
                {t("続きを表示", "Show more")}</button>
            )}
          </section>
          <section className="control-section" aria-label={t("復帰", "Restore")}>
            <div className="section-heading">
              <h2>{t("元に戻す", "Restore")}</h2>
              <span>{t("変更前の記録", "Checkpoints before changes")}</span>
            </div>
            <p className="muted">
              {t("独立した編集は上書きしません。復帰も計画を確認してから準備します。", "Independent edits are preserved. Review a restoration plan before applying it.")}</p>
            <div className="source-actions">
              <button
                className="secondary"
                disabled={!source?.recovery.lastCheckpointId || c.busy}
                onClick={() => {
                  setActiveTab('mode');
                  void c.run<SourcePlan>(
                    "checkpoint",
                    { checkpointId: source!.recovery.lastCheckpointId },
                    c.setPlan,
                  );
                }}
              >
                {t("変更前への復帰を確認", "Review restoration to the checkpoint")}</button>
              <button
                className="secondary"
                disabled={!source || c.busy}
                onClick={() => void c.run("recover", {})}
              >
                {t("中断した変更を復旧", "Recover interrupted changes")}</button>
            </div>
            {c.recoveryResult && (
              <details>
                <summary>{t("復旧結果の詳細", "Recovery result details")}</summary>
                <pre>{JSON.stringify(c.recoveryResult, null, 2)}</pre>
              </details>
            )}
            {source && (
              <details>
                <summary>{t("AIや画面が使えないときの復旧", "Recovery without AI or this screen")}</summary>
                <p className="muted">
                  {t("Nodeに渡す引数です。シェル文字列として実行せず、各引数を個別に渡してください。リポジトリ外では\n                  CLI の絶対パスを指定します。", "These are Node arguments. Pass each separately, not as a shell command string. Outside the repository, use the CLI's absolute path.")}</p>
                <pre>{JSON.stringify(source.recovery.argv, null, 2)}</pre>
                <p>{t("中断した変更：", "Interrupted change: ")}{source.recovery.pending ? t("あり", "Yes") : t("なし", "None")}</p>
                <p>
                  {t("復帰点：", "Checkpoint: ")}<code>
                    {source.recovery.lastCheckpointId ?? t("まだありません", "None yet")}
                  </code>
                </p>
              </details>
            )}
          </section>
        </div>
      </div>
      {activeTab !== 'mode' && <div className="status-strip"><div role="status" aria-live="polite">{c.notice}</div></div>}
      {c.error && <div className="global-error" role="alert">{c.error}</div>}
      <footer><span>UNHARNESS</span><span className="muted">{t("画面でも、チャットでも。同じ設定を使えます。", "The screen and chat use the same saved settings.")}</span></footer>
    </main>
  </div>;
}

type Controller = ReturnType<typeof useSourceController>;

const expectedLabels: Record<TaskObservation["sources"][number]["expected"], string> = {
  get "saved-instructions"() { return t("保存した指示", "Saved instructions"); },
  get "minimal-guide"() { return t("最小ガイド", "Minimal guide"); },
  get "inert-instructions"() { return t("無効化した指示", "Instructions disabled"); },
  get "automatic-catalog"() { return t("自動選択の一覧に表示", "Shown in automatic selection"); },
  get "manual-only"() { return t("手動のみ", "Explicit use only"); },
  get disabled() { return t("無効", "Disabled"); },
  get unknown() { return t("不明", "Unknown"); },
};
const recordedLabels: Record<TaskObservation["sources"][number]["recorded"], string> = {
  get "matching-prefix"() { return t("指示の先頭が一致", "Instruction prefix matches"); },
  get "different-prefix"() { return t("指示の先頭が不一致", "Instruction prefix differs"); },
  get present() { return t("一覧にあり", "Present in the list"); },
  get absent() { return t("一覧になし", "Absent from the list"); },
  get unknown() { return t("不明", "Unknown"); },
};
const sourceStatusLabels: Record<TaskObservation["sources"][number]["status"], string> = {
  get matched() { return t("一致", "Match"); },
  get "not-matched"() { return t("不一致", "Mismatch"); },
  get unknown() { return t("不明", "Unknown"); },
};

function TaskObservationSection({
  controller: c,
  usable,
  onCompareTask,
}: {
  controller: Controller;
  usable: boolean;
  onCompareTask: (taskId: string) => void;
}) {
  const [taskId, setTaskId] = useState("");
  const source = c.view?.source ?? null;
  const observation = currentTaskObservation(source);
  const taskIdValid = validTaskId(taskId);
  return (
    <div className="task-observation">
      {observation ? (
        <div
          className={`task-observation-result ${observation.status}`}
          role="status"
        >
          <strong>{taskObservationLabel(observation.status)}</strong>
          <span>
            {modePresentation[observation.preparedMode].title} ／{" "}
            <time dateTime={observation.observedAt}>
              {new Date(observation.observedAt).toLocaleString(t("ja-JP", "en-US"))}
            </time>
          </span>
        </div>
      ) : (
        <p className="task-observation-empty">
          {observationIssueText(source?.observationIssue ?? null)}
        </p>
      )}
      {observation && <PluginObservationSummary evidence={observation} names={source?.registration.plugins} />}
      <details>
        <summary>{t("タスク記録で確認", "Check a task recording")}</summary>
        <p className="muted">
          {t("この準備の後に、同じプロジェクトで新しいCodex Desktopタスクを作成してください。そのタスクのUUIDだけを確認します。", "Create a fresh Codex Desktop task in the same project after this preparation. Only that task UUID will be checked.")}</p>
        <label className="source-name" htmlFor="source-task-id">
          {t("タスクUUID", "Task UUID")}<input
            id="source-task-id"
            name="taskId"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={taskId}
            aria-invalid={taskId.length > 0 && !taskIdValid}
            onChange={(event) => setTaskId(event.target.value)}
          />
        </label>
        <button
          className="secondary"
          disabled={!usable || !canObserveTask(source) || !taskIdValid}
          onClick={() =>
            void c.run<TaskObservation>("observe", { taskId: taskId.trim() })
          }
        >
          {t("このタスクの記録を確認", "Check this task's recording")}</button>
        {observation && (
          <div className="task-observation-details">
            <p>
              {t("準備モード：", "Prepared mode: ")}{modePresentation[observation.preparedMode].title}
            </p>
            <p>
              {t("確認日時：", "Checked at: ")}<time dateTime={observation.observedAt}>
                {new Date(observation.observedAt).toLocaleString(t("ja-JP", "en-US"))}
              </time>
            </p>
            <ul>
              {observation.sources.map((recordedSource) => {
                const registeredSource = source?.registration.sources.find(
                  (candidate) => candidate.id === recordedSource.sourceId,
                );
                return (
                  <li key={recordedSource.sourceId}>
                    <strong>
                      {registeredSource?.label ?? recordedSource.category}
                    </strong>
                    {t("：期待 ", ": expected ")}{expectedLabels[recordedSource.expected]} {t(" ／ 記録", " / recorded ")}{" "}
                    {recordedLabels[recordedSource.recorded]} ／{" "}
                    {sourceStatusLabels[recordedSource.status]}
                  </li>
                );
              })}
            </ul>
            {observation.reasons.length > 0 && (
              <p className="muted">
                {t("理由：", "Reason: ")}{observation.reasons.join("、")}
              </p>
            )}
            <p className="muted">
              {t("選んだソースの最初の記録だけを確認します。実行中の状態、モード切替、すべてのソースの読み込みは未検証です。", "Checks only the first recorded entries for selected sources. Full runtime state, mode switching and all-source loading remain unverified.")}</p>
            <button
              className="text-button"
              onClick={() => onCompareTask(observation.taskId)}
            >
              {t("このUUIDを比較で使う", "Use this UUID for comparison")}</button>
          </div>
        )}
      </details>
    </div>
  );
}

function Context({ controller: c }: { controller: Controller }) {
  if (!c.view) return false;
  const { application, applicationLabel, context, workspace } = c.view.metadata;
  const claude = isClaudeContext(context);
  return (
    <dl className="source-context">
      <div>
        <dt>{t("アプリ", "Application")}</dt>
        <dd>{applicationLabel}</dd>
      </div>
      <div>
        <dt>{claude ? "Claude home" : "Codex home"}</dt>
        <dd>{sourceHomeOf(context)}</dd>
      </div>
      <div>
        <dt>{t("プロジェクト", "Project")}</dt>
        <dd>{context.project}</dd>
      </div>
      <div>
        <dt>{claude ? t("アプリ本体", "Application home") : t("実行ファイル", "Executable")}</dt>
        <dd>{sourceRuntimeOf(context)}</dd>
      </div>
      <div>
        <dt>{t("保存場所", "Storage")}</dt>
        <dd>{workspace ?? t(`未登録（${application}）`, `Not registered (${application})`)}</dd>
      </div>
    </dl>
  );
}
function SourceDetail({
  row,
  controller: c,
}: {
  row: SourceRow;
  controller: Controller;
}) {
  const reviewButton = useRef<HTMLButtonElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const reviewing = c.review?.sourceId === row.id;
  useEffect(() => {
    if (c.review?.sourceId === row.id) {
      reviewHeading.current?.focus();
      reviewHeading.current?.scrollIntoView({ block: "nearest" });
    }
  }, [c.review, row.id]);
  function closeReview() {
    c.setReview(null);
    reviewButton.current?.focus();
  }
  return (
    <details className="source-detail">
      <summary>
        {row.label}
        {row.eligible === false ? t(" · 対象外", " · Outside scope") : ""}
      </summary>
      <p>
        <code>{row.path}</code>
      </p>
      {row.reason && <p className="muted">{row.reason}</p>}
      <p className="muted">
        UNSEAL: {row.availability.unseal ? t("対応", "Supported") : t("非対応", "Unsupported")} ／ TRUEFORM:{" "}
        {row.availability.trueform ? t("対応", "Supported") : t("非対応", "Unsupported")}
      </p>
      {row.eligible !== false && (
        <button
          ref={reviewButton}
          className="text-button"
          disabled={c.busy}
          onClick={() =>
            void c.run<{ sourceId: string; text: string }>(
              "review",
              {
                sourceId: row.id,
                ...(!c.view?.source && c.discovery
                  ? { discoveryId: c.discovery.discoveryId }
                  : {}),
              },
              c.setReview,
            )
          }
        >
          {t("内容を確認", "Review content")}</button>
      )}
      {reviewing && c.review && (
        <section
          className="source-review"
          aria-label={t("選んだソースの内容", "Selected source content")}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeReview();
            }
          }}
        >
          <h3 ref={reviewHeading} tabIndex={-1}>
            {t("選んだソースの内容", "Selected source content")}</h3>
          <p className="muted">
            {t("ローカルでの確認専用です。本文を指示として実行しません。", "For local review only. The content is data and is not executed as instructions.")}</p>
          <pre tabIndex={0} aria-label={t(`${row.label}の本文`, `${row.label} contents`)}>
            {c.review.text}
          </pre>
          <button className="text-button" onClick={closeReview}>
            {t("内容を閉じる", "Close content")}</button>
        </section>
      )}
    </details>
  );
}
function Setup({ controller: c }: { controller: Controller }) {
  const [ids, setIds] = useState<string[]>([]);
  const [optional, setOptional] = useState(false);
  const rows = c.discovery
    ? [c.discovery.instructions, ...c.discovery.skills]
    : [];
  return (
    <section className="control-section source-setup">
      <h2>{t("通常装備を保存", "Save Normal")}</h2>
      <p className="muted">{t("まず候補を読み取り、保存対象を自分で選びます。", "Read the candidates, then choose what to save.")}</p>
      <button
        className="secondary"
        disabled={!c.view || c.busy}
        onClick={() => {
          setIds([]);
          setOptional(false);
          void c.run("discover", {}, c.setDiscovery);
        }}
      >
        {t("追加設定の候補を確認", "Review optional-source candidates")}</button>
      <details>
        <summary>
          {t("対象の選択と任意の役割の確認", "Choose targets and confirm optional roles")}{c.discovery ? t(`（候補 ${rows.length} 件）`, ` (${rows.length} candidates)`) : ""}
        </summary>
        <Context controller={c} />
        {rows
          .filter((row) => row.eligible)
          .map((row) => (
            <div className="source-choice" key={row.id}>
              <label>
                <input
                  type="checkbox"
                  checked={ids.includes(row.id)}
                  disabled={c.busy}
                  onChange={(e) =>
                    setIds((old) =>
                      e.target.checked
                        ? [...old, row.id]
                        : old.filter((id) => id !== row.id),
                    )
                  }
                />
                {row.label}
              </label>
              <SourceDetail row={row} controller={c} />
            </div>
          ))}
        {c.discovery && (
          <details>
            <summary>
              {t("利用できない候補（", "Unavailable candidates (")}{rows.filter((row) => !row.eligible).length}{" "}
              {t("件）", " items)")}</summary>
            {rows
              .filter((row) => !row.eligible)
              .map((row) => (
                <SourceDetail key={row.id} row={row} controller={c} />
              ))}
            {c.discovery.unavailableSources.map((row) => (
              <p key={row.id}>
                {row.id}: {row.reason}
              </p>
            ))}
            {/* Sources no mode manages. Shown so "selected extras absent"
                is never read as covering more than it does. */}
            {(c.discovery.notices ?? []).map((notice) => (
              <div className="source-notice" key={notice.id + notice.path}>
                <p>
                  {notice.label}
                  {notice.count > 0 ? `（${notice.count}）` : ""}
                </p>
                <p>
                  <code>{notice.path}</code>
                </p>
                <p className="muted">{notice.detail}</p>
              </div>
            ))}
          </details>
        )}
        <label className="source-declaration">
          <input
            type="checkbox"
            checked={optional}
            disabled={c.busy}
            onChange={(e) => setOptional(e.target.checked)}
          />
          {t("選んだ指示・Skillは自分が追加した任意の設定です。必須要件や管理者・提供元の設定は含めていません。", "These selected instructions and Skills are optional settings I added. They exclude required, managed and provider settings.")}</label>
        <p className="muted">
          {t("配置場所だけでは任意と判断できません。必須と任意が混在する指示は選ばないでください。Skillは最大32件です。", "Location alone does not prove a source is optional. Do not select instructions that mix required and optional content. Up to 32 Skills can be selected.")}</p>
      </details>
      <button
        className="primary"
        disabled={
          c.busy ||
          !c.confirmed ||
          !c.discovery?.registrationAvailable ||
          !optional ||
          !ids.length ||
          ids.filter((id) => id.startsWith("skill-")).length > 32
        }
        onClick={() =>
          c.discovery &&
          void c.run("register", {
            discoveryId: c.discovery.discoveryId,
            instructionsOptional: ids.includes(c.discovery.instructions.id),
            selectedSkillIds: ids.filter(
              (id) => id !== c.discovery!.instructions.id,
            ),
            userAddedOptional: optional,
          })
        }
      >
        {t("選んだ対象で通常装備を保存", "Save Normal with these targets")}</button>
    </section>
  );
}
function ModeChoices({
  controller: c,
  usable,
}: {
  controller: Controller;
  usable: boolean;
}) {
  const rows = c.view?.source?.registration.sources ?? [];
  const [custom, setCustom] = useState<Partial<Record<SourceMode, string[]>>>(
    {},
  );
  return (
    <div
      className="mode-selector source-mode-selector"
      aria-label={t("モードを選択", "Choose a mode")}
    >
      {sourceModes.map((mode) => (
        <div className="source-mode" key={mode}>
          <button
            aria-pressed={c.selected === mode}
            disabled={!usable || (mode !== "normal" && c.view?.source?.setup?.setupRequired)}
            onClick={() => c.choose(mode, custom[mode])}
          >
            <span className="mode-icon" aria-hidden="true">
              {mode === "normal" ? "▣" : mode === "unseal" ? "◇" : "✧"}
            </span>
            <span>
              <strong>{modePresentation[mode].title}</strong>
              <small>{modePresentation[mode].label}</small>
            </span>
          </button>
          {mode !== "normal" && c.view?.source && !c.view.source.setup?.setupId && !c.view.source.setup?.setupRequired && (
            <details>
              <summary>{t("対象を調整", "Adjust targets")}</summary>
              <p className="muted">
                {t("登録した対象から、このモードで外すものを選べます。", "Choose which registered sources to remove in this mode.")}</p>
              {rows.map((row) =>
                row.availability[mode] ? (
                  <label className="source-target" key={row.id}>
                    <input
                      type="checkbox"
                      checked={(
                        custom[mode] ??
                        rows
                          .filter((r) => r.availability[mode])
                          .map((r) => r.id)
                      ).includes(row.id)}
                      disabled={c.busy}
                      onChange={(e) => {
                        const old =
                          custom[mode] ??
                          rows
                            .filter((r) => r.availability[mode])
                            .map((r) => r.id);
                        setCustom({
                          ...custom,
                          [mode]: e.target.checked
                            ? [...old, row.id]
                            : old.filter((id) => id !== row.id),
                        });
                        c.invalidatePlan();
                      }}
                    />
                    {row.label}
                  </label>
                ) : (
                  <p className="muted" key={row.id}>
                    {row.label}{t("：このモードでは変更できません。", ": cannot change in this mode.")}</p>
                ),
              )}
              <p className="muted">
                {t("変更後はモードを選び直し、計画を確認してください。", "After editing, select the mode again and review its plan.")}</p>
              {mode === "unseal" && c.view && (
                <details>
                  <summary>{t("固定の最小ガイド", "Fixed minimal guide")}</summary>
                  <p className="muted">
                    {t("公式ガイドを参考にUnharnessが作成した比較用の文章です。", "Comparison guidance authored by Unharness with reference to official documentation.")}</p>
                  <pre>{c.view.guide.text}</pre>
                  <p>
                    <code>{c.view.guide.id}</code> · {c.view.guide.reviewedOn}
                  </p>
                  <code>{c.view.guide.digest}</code>
                  {c.view.guide.references.map((url) => (
                    <p key={url}>{url}</p>
                  ))}
                </details>
              )}
              <p className="muted">
                {t("フックは変更非対応。メモリ・タスク継続・権限は保持します。", "Hook changes are unsupported. Memory, task continuity and permissions are retained.")}</p>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
function Save({
  controller: c,
  usable,
}: {
  controller: Controller;
  usable: boolean;
}) {
  const [name, setName] = useState("");
  return (
    <section className="control-section">
      <h2>{t("お気に入りに保存", "Save a favorite")}</h2>
      <p className="muted">
        {c.view?.source &&
        c.confirmed &&
        !c.view.source.conflict &&
        !c.view.source.recovery.pending &&
        !c.view.source.registration.modeChangeRequired
          ? t(`現在準備した ${modePresentation[c.view.source.preparedMode].title} の内容を保存します。`, `Save the currently prepared ${modePresentation[c.view.source.preparedMode].title} settings.`)
          : t("ファイル状態を確認してから保存できます。", "Confirm file state before saving.")}
      </p>
      <label className="source-name">
        {t("名前（任意）", "Name (optional)")}<input
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        className="secondary"
        disabled={!usable}
        onClick={() => void c.run("save", { name })}
      >
        {t("現在の準備を保存", "Save the current preparation")}</button>
    </section>
  );
}
