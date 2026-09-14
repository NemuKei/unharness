import { useEffect, useRef, useState } from 'react';
import { Hangar } from '../Hangar';
import { preparedAppearances } from '../prepared-appearances';
import type { PreparedAppearanceId } from '../prepared-appearances';
import { publicModes } from '../entry/public-modes';
import type { SourceMode } from '../sources';
import { siteConfig } from '../site-config';
import { copy } from './copy';
import type { Locale, Scenario, Stage } from './copy';

type Page = 'home' | 'guide' | 'how' | 'install';
type RequestKind = 'install' | 'open' | 'settings' | 'skill' | 'fresh';
const modeIds: SourceMode[] = ['normal', 'unseal', 'trueform'];
const scenarioIds: Scenario[] = ['first', 'update', 'returning'];
const github = 'https://github.com/NemuKei/unharness';

function initialLocale(): Locale {
  try { return localStorage.getItem('unharness.guided-preview.locale') === 'en' ? 'en' : 'ja'; }
  catch { return 'ja'; }
}

function requestText(kind: RequestKind, locale: Locale, mode: SourceMode) {
  const release = siteConfig.macCodexRelease!;
  if (kind === 'install') {
    const instructions = locale === 'ja'
      ? 'このApple Silicon Macで使うCodex DesktopへUnharness ' + release.version + 'を導入してください。配布物のSHA-256と内容を確認し、展開した「はじめに.md」に従って進めてください。実際のプロファイルとプロジェクトを確認し、保存済みのNormal・設定・作品・メモリ・権限を保持してください。導入後は接続と復旧経路を確認し、初回の対象確認とNormal保存へ案内してください。'
      : 'Install Unharness ' + release.version + ' for Codex Desktop on this Apple Silicon Mac. Verify the archive SHA-256 and contents, then follow the bundled はじめに.md. Confirm the actual profile and project. Preserve existing Normal, settings, artwork, memory and permissions. Check the connection and recovery path, then guide me through reviewing the initial targets and saving Normal. Please guide me in English.';
    return instructions + '\n\nZIP: ' + release.archiveUrl + '\nSHA-256: ' + release.archiveSha256
      + '\nDistribution ID: ' + release.distributionId + '\nSource: ' + release.sourceUrl;
  }
  const ja = {
    open: 'アンハーネスを開いて。接続先と現在の状態を確認し、次にできることを案内してください。',
    settings: 'アンハーネスの限定解除と零式のSkill構成を見直したいです。現在の状態とモデルを確認し、保存済みNormalを保持して構成案を提案してください。まだ設定は変更しないでください。',
    skill: '選んだ自作Skillの内容を見直したいです。対象と現在使っているモデルを確認し、そのモデルの公式ガイドを参考に改善案を作ってください。提供元の版更新やUnharnessのモード変更とは分け、採用前に元の内容を書き換えないでください。',
    fresh: 'アンハーネスで' + publicModes[mode].title + 'を試したいです。まず実際の状態を確認してください。この画面案では設定を準備していません。必要な準備と、新しいタスクで使う手順を案内してください。',
  };
  const en = {
    open: 'Open Unharness. Check the connection and current state, then suggest the next useful action. Please guide me in English.',
    settings: 'Help me review my UNSEAL and TRUEFORM Skill choices in Unharness. Check my current state and model, preserve saved Normal, and propose a pair of configurations. Do not change the settings yet. Please guide me in English.',
    skill: 'Help me review selected Skills I authored. Confirm the targets and my current model, then use official guidance for that model to propose improvements. Keep content editing separate from upstream version updates and Unharness mode changes. Preserve the originals until I adopt a change. Please guide me in English.',
    fresh: 'Help me try ' + publicModes[mode].title + ' in Unharness. Check my real state first: the concept preview did not prepare any settings. Guide the required preparation and how to use a fresh task. Please guide me in English.',
  };
  return (locale === 'ja' ? ja : en)[kind];
}

export function GuidedPreview() {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [page, setPage] = useState<Page>('home');
  const [scenario, setScenario] = useState<Scenario>('first');
  const [stage, setStage] = useState<Stage>('welcome');
  const [mode, setMode] = useState<SourceMode>('normal');
  const [prepared, setPrepared] = useState<SourceMode>('normal');
  const [normalSaved, setNormalSaved] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [version, setVersion] = useState('0.0.9');
  const [appearance, setAppearance] = useState<PreparedAppearanceId>('default');
  const [effects, setEffects] = useState(true);
  const [request, setRequest] = useState<RequestKind | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const main = useRef<HTMLElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const copyAttempt = useRef(0);
  const previousPage = useRef(page);
  const t = copy[locale], look = preparedAppearances.find(item => item.id === appearance)!;

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = locale === 'ja' ? 'Unharness — AIナビゲーションの画面案' : 'Unharness — Guided experience concept';
    try { localStorage.setItem('unharness.guided-preview.locale', locale); } catch { /* Session-only fallback. */ }
  }, [locale]);
  useEffect(() => {
    if (previousPage.current === page) return;
    previousPage.current = page;
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [page]);
  useEffect(() => {
    if (request && !dialog.current?.open) dialog.current?.showModal();
    if (!request && dialog.current?.open) dialog.current.close();
  }, [request]);

  function startScenario(next: Scenario) {
    setScenario(next); setPage('guide'); setMode('normal'); setPrepared('normal'); setReviewed(false);
    setNormalSaved(next !== 'first');
    setVersion(next === 'update' ? '0.0.8' : '0.0.9');
    setStage(next === 'first' ? 'welcome' : next === 'update' ? 'update' : 'ready');
  }
  function openRequest(kind: RequestKind) { ++copyAttempt.current; setCopyState('idle'); setRequest(kind); }
  function closeRequest() { ++copyAttempt.current; setRequest(null); setCopyState('idle'); }
  async function copyRequest(kind: RequestKind) {
    const attempt = ++copyAttempt.current;
    setCopyState('idle');
    setRequest(kind);
    try { await navigator.clipboard.writeText(requestText(kind, locale, mode)); if (attempt === copyAttempt.current) setCopyState('copied'); }
    catch { if (attempt === copyAttempt.current) setCopyState('failed'); }
  }
  function saveNormal() {
    if (!reviewed) return;
    setNormalSaved(true); setStage('proposal'); setMode('trueform');
  }
  function prepare() { setPrepared(mode); setStage('prepared'); }

  const scene = <section className="gp-scene" aria-label={t.modeLabel}>
    <div className="gp-scene-heading"><span>{t.selectedPreview}</span><strong>{publicModes[mode].title}</strong></div>
    <Hangar condition={publicModes[mode].scene} effects={effects} locale={locale}
      artwork={appearance === 'default' ? undefined : look.artwork}
      imageLoader={appearance === 'default' ? undefined : look.image} />
    <div className="gp-mode-picker" role="group" aria-label={t.modeLabel}>
      {modeIds.map(id => <button type="button" key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>
        <strong>{publicModes[id].title}</strong>{locale === 'ja' && <span>{t.modes[id]}</span>}
      </button>)}
    </div>
    <p className="gp-mode-note">{t.modeNotes[mode]}</p>
    <div className="gp-appearance-row">
      <label>{t.appearanceLabel}<select value={appearance} onChange={e => setAppearance(e.target.value as PreparedAppearanceId)}>
        {preparedAppearances.map(item => <option key={item.id} value={item.id}>{t.looks[item.id]}</option>)}
      </select></label>
      <label className="gp-toggle"><input type="checkbox" checked={effects} onChange={e => setEffects(e.target.checked)} />{t.effects}</label>
    </div>
  </section>;

  const modeSummary = <dl className="gp-source-summary">
    <div><dt>{t.instructions}</dt><dd>{mode === 'normal' ? t.keep : mode === 'unseal' ? t.minimal : t.removed}</dd></div>
    <div><dt>{t.ownSkills}</dt><dd>{mode === 'trueform' ? t.manual : t.automatic}</dd></div>
    <div><dt>{t.externalSkills}</dt><dd>{mode === 'normal' ? t.automatic : mode === 'unseal' ? t.manual : t.disabled}</dd></div>
  </dl>;

  return <div className="gp-app" data-page={page} data-stage={stage}>
    <a href="#gp-main" className="gp-skip">{t.skip}</a>
    <div className="gp-chrome"><div className="gp-preview-notice"><strong>{t.preview}</strong><span>{t.previewNote}</span></div>
    <header className="gp-header">
      <button type="button" className="gp-brand" onClick={() => { setPage('home'); window.scrollTo(0, 0); }} aria-label={locale === 'ja' ? 'Unharnessのホーム' : 'Unharness home'}>
        UNHARNESS<span>{t.tagline}</span>
      </button>
      <nav className="gp-navigation" aria-label={locale === 'ja' ? 'ページ' : 'Pages'}>
        <button type="button" aria-current={page === 'guide' ? 'page' : undefined} onClick={() => setPage('guide')}>{t.navDemo}</button>
        <button type="button" aria-current={page === 'how' ? 'page' : undefined} onClick={() => setPage('how')}>{t.navHow}</button>
        <button type="button" aria-current={page === 'install' ? 'page' : undefined} onClick={() => setPage('install')}>{t.navInstall}</button>
      </nav>
      <div className="gp-utilities">
        <button type="button" className="gp-language" lang={locale === 'ja' ? 'en' : 'ja'} onClick={() => setLocale(locale === 'ja' ? 'en' : 'ja')}>
          {locale === 'ja' ? 'English' : '日本語'}
        </button>
        <a href={github} target="_blank" rel="noopener noreferrer" className="gp-github">GitHub ↗</a>
      </div>
    </header></div>
    <main id="gp-main" ref={main} tabIndex={-1}>
      {page === 'home' && <>
        <section className="gp-hero">
          <div className="gp-hero-copy">
            <p className="gp-eyebrow">{t.heroEyebrow}</p>
            <h1>{t.heroFirst}<br/><span>{t.heroSecond}</span></h1>
            <p className="gp-lead">{t.heroLead}</p><p className="gp-hero-body">{t.heroBody}</p>
            <div className="gp-actions">
              <button type="button" className="gp-primary" onClick={() => startScenario('first')}>{t.heroPrimary}<span aria-hidden="true"> →</span></button>
              <button type="button" className="gp-secondary" onClick={() => setPage('install')}>{t.heroSecondary}</button>
            </div>
            <button type="button" className="gp-text-button" onClick={() => startScenario('returning')}>{t.installedEntry} ↗</button>
            <div className="gp-availability"><p>{t.availability}</p><p>{t.future}</p></div>
          </div>
          <div className="gp-hero-scene">{scene}</div>
        </section>
        <section className="gp-journey">
          <div><p className="gp-eyebrow">OPEN. CHOOSE. TRY.</p><h2>{t.journeyTitle}</h2><p>{t.journeyBody}</p></div>
          <ol>{t.journeySteps.map((title, i) => <li key={i}><span className="gp-step-number">0{i + 1}</span><div><h3>{title}</h3><p>{t.journeyDescriptions[i]}</p></div></li>)}</ol>
        </section>
      </>}
      {page === 'guide' && <>
        <div className="gp-page-heading"><p className="gp-eyebrow">{t.guideEyebrow}</p><h1>{t.guideTitle}</h1><p>{t.guideLead}</p></div>
        <div className="gp-scenarios"><span>{t.scenariosLabel}</span><div role="group" aria-label={t.scenariosLabel}>
          {scenarioIds.map(id => <button type="button" key={id} aria-pressed={scenario === id} onClick={() => startScenario(id)}>{t.scenarios[id]}</button>)}
        </div></div>
        <div className="gp-guide-layout">
          <div className="gp-guide-column">
            <div className="gp-user-message"><span>{t.you}</span><p>{t.askOpen}</p></div>
            <article className="gp-guide-message">
              <div className="gp-guide-label"><span className="gp-guide-light" aria-hidden="true"/>{t.ai}</div>
              <div className="gp-guide-prompt" aria-live="polite" aria-atomic="true"><h2>{t.stages[stage][0]}</h2><p>{t.stages[stage][1]}</p></div>
              {stage === 'welcome' && <button type="button" className="gp-primary" onClick={() => setStage('inventory')}>{t.openConfirm} →</button>}
              {stage === 'inventory' && <div className="gp-scope-review">
                <h3>{t.scopeTitle}</h3><p>{t.scopeLead}</p>
                <dl>{t.scopeNames.map((name, i) => <div key={i}><dt>{name}</dt><dd>{t.scopeValues[i]}</dd></div>)}</dl>
                <p className="gp-preserved">{t.protected}</p>
                <label className="gp-confirm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/>{t.reviewed}</label>
                <button type="button" className="gp-primary" disabled={!reviewed} onClick={saveNormal}>{t.saveNormal} →</button>
                {!reviewed && <p className="gp-hint">{t.reviewHint}</p>}
              </div>}
              {(stage === 'proposal' || stage === 'ready' || stage === 'updated') && <div className="gp-proposal">
                <p className="gp-section-label">{t.next}</p>
                <div className="gp-proposal-choices">
                  {(['trueform', 'unseal'] as const).map(id => <button type="button" key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>
                    {locale === 'ja' && <span>{publicModes[id].title}</span>}<strong>{t.modes[id]}</strong><p>{t.modeNotes[id]}</p>
                  </button>)}
                </div>
                {modeSummary}<p className="gp-hint">{t.proposalNote}</p>
                <div className="gp-actions"><button type="button" className="gp-primary" onClick={prepare}>{t.trySelected} →</button>
                  <button type="button" className="gp-text-button" onClick={() => openRequest('settings')}>{t.consult}</button></div>
              </div>}
              {stage === 'prepared' && <div className="gp-prepared-next">
                <p className="gp-prepared-mode">{publicModes[prepared].title}<span>{locale === 'ja' ? 'サンプルの準備完了' : 'Sample prepared'}</span></p>
                <button type="button" className="gp-primary" onClick={() => openRequest('fresh')}>{t.freshTask} ↗</button>
                <button type="button" className="gp-text-button" onClick={() => setStage('ready')}>{t.backGuide}</button>
              </div>}
              {stage === 'update' && <div className="gp-update">
                <h3>{t.updateChangeTitle}</h3><ul>{t.updateChanges.map(text => <li key={text}>{text}</li>)}</ul>
                <p className="gp-preserved">{t.updateKeeps}</p>
                <div className="gp-actions"><button type="button" className="gp-primary" onClick={() => setStage('reload')}>{t.updateNow} →</button>
                  <button type="button" className="gp-secondary" onClick={() => setStage('ready')}>{t.updateLater}</button></div>
                <p className="gp-hint">{t.startupPrompt}</p>
              </div>}
              {stage === 'reload' && <button type="button" className="gp-primary" onClick={() => { setVersion('0.0.9'); setStage('updated'); }}>{t.reloadNext} →</button>}
            </article>
            <details className="gp-skill-review"><summary>{t.skillTitle}</summary><p>{t.skillBody}</p>
              <button type="button" className="gp-text-button" onClick={() => openRequest('skill')}>{t.skillAction} ↗</button><p className="gp-hint">{t.skillBoundary}</p></details>
            <button type="button" className="gp-retry" onClick={() => startScenario(scenario)}>{t.retry}</button>
          </div>
          <aside className="gp-guide-stage">
            <div className="gp-state-strip"><div><span>{t.sampleVersion}</span><strong data-testid="sample-version">{version}</strong></div>
              <div><span>{t.preparedLabel}</span><strong data-testid="prepared-mode">{normalSaved ? publicModes[prepared].title : t.notSaved}</strong></div></div>
            {scene}
            <p className="gp-hint gp-stage-foot">{t.appearanceNote}</p>
          </aside>
        </div>
      </>}
      {page === 'install' && <section className="gp-install">
        <div className="gp-page-heading"><p className="gp-eyebrow">{t.installEyebrow}</p><h1>{t.installTitle}</h1><p>{t.installBody}</p></div>
        <div className="gp-install-layout"><div className="gp-install-main">
          <div className="gp-target"><span>{t.targetLabel}</span><strong>{t.targetValue}</strong><p>{t.future}</p></div>
          <p className="gp-release">{t.releasePrefix} <strong>{siteConfig.macCodexRelease?.version}</strong></p>
          <button type="button" className="gp-primary" onClick={() => void copyRequest('install')}>{t.installCopy} ↗</button>
          <p className="gp-hint">{t.copyBoundary}</p>
          <details className="gp-downloads"><summary>{t.advanced}</summary>
            <a href={siteConfig.macCodexRelease?.archiveUrl} referrerPolicy="no-referrer">{t.zip} ↗</a>
            <a href={github + '/releases/tag/v' + siteConfig.macCodexRelease?.version} target="_blank" rel="noopener noreferrer">{t.release} ↗</a>
            <a href={github} target="_blank" rel="noopener noreferrer">{t.source} ↗</a>
          </details>
        </div><aside className="gp-install-after"><p className="gp-eyebrow">{t.installAfter}</p><h2>“{t.installOpen}”</h2><p>{t.installAfterBody}</p>
          <button type="button" className="gp-text-button" onClick={() => void copyRequest('open')}>{t.copy} ↗</button>
          <button type="button" className="gp-secondary" onClick={() => startScenario('first')}>{t.seeFirst} →</button>
        </aside></div><p className="gp-offline">{t.offline}</p>
      </section>}
      {page === 'how' && <section className="gp-how">
        <div className="gp-page-heading"><p className="gp-eyebrow">{t.howEyebrow}</p><h1>{t.howTitle}</h1><p>{t.howBody}</p></div>
        <ol>{t.howRows.map(([title, body], i) => <li key={i}><span className="gp-step-number">0{i + 1}</span><div><h2>{title}</h2><p>{body}</p></div></li>)}</ol>
        <p className="gp-concept-boundary">{t.howFoot}</p>
        <button type="button" className="gp-primary" onClick={() => startScenario('first')}>{t.heroPrimary} →</button>
      </section>}
    </main>
    <footer className="gp-footer"><span>{t.footer}</span><div>
      <a href="https://unharness.deltahelmlab.com/" target="_blank" rel="noopener noreferrer">{t.openSite} ↗</a>
      <a href={github + '/issues'} target="_blank" rel="noopener noreferrer">{t.feedback} ↗</a>
      <a href="https://deltahelmlab.com/" target="_blank" rel="noopener noreferrer">DeltaHelm Lab ↗</a>
    </div></footer>
    <dialog ref={dialog} className="gp-dialog" onCancel={closeRequest} onClose={closeRequest} aria-labelledby="gp-request-title">
      <div className="gp-dialog-heading"><h2 id="gp-request-title">{t.dialogLabel}</h2><button type="button" onClick={closeRequest}>{t.dialogClose}</button></div>
      <p>{t.copyBoundary}</p>
      <label>{t.requestLabel}<textarea readOnly value={request ? requestText(request, locale, mode) : ''} onFocus={e => e.currentTarget.select()}/></label>
      <button type="button" className="gp-primary" onClick={() => { if (request) void copyRequest(request); }}>{t.copy}</button>
      <p className="gp-copy-status" role="status">{copyState === 'copied' ? t.copied : copyState === 'failed' ? t.copyFailed : ''}</p>
    </dialog>
  </div>;
}
