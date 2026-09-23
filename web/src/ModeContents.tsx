import { useEffect, useRef, useState } from 'react';
import { text as t } from './locale.ts';
import { modeHeading, modePresentation, sourceModes } from './sources';
import type { SourceMode } from './sources';
import type { useSourceController } from './useSourceController';
import './mode-contents.css';
import { ApiError } from './api';

type Skill = { id: string; label: string; state: 'automatic' | 'manual' | 'disabled' | 'unknown'; requiredControl: boolean };
type Mode = { available: boolean; reason?: string; snapshotId: string; instructions: { sourceId: string | null; label: string; style: 'saved' | 'minimal' | 'custom' | 'none' | 'unmanaged'; readable: boolean }; skills: Skill[]; plugins: { id: string; label: string; enabled: boolean; requiredControl: boolean }[] };
type Contents = { scopeId: string; normalId: string; setupId: string | null; preparedSetupId: string | null; modes: Record<SourceMode, Mode> };
type Body = { scopeId: string; mode: SourceMode; snapshotId: string; sourceId: string; text: string };
const labels = () => ({ automatic: t('自動で選べる', 'Automatic selection'), manual: t('指定したときだけ使う', 'Only when requested'), disabled: t('使わない', 'Not used'), unknown: t('未確認', 'Unconfirmed') });
const instructionLabel = (style: string) => ({ saved: t('保存したAGENTS.md', 'Saved AGENTS.md'), minimal: t('最小ガイド', 'Minimal guide'), custom: t('保存した追加指示', 'Saved custom instructions'), none: t('追加指示なし', 'No optional instructions'), unmanaged: t('登録対象外・そのまま保持', 'Outside the registered scope; retained') })[style] ?? t('未確認', 'Unconfirmed');
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function valid(data: Contents) {
  return data && hash(data.scopeId) && hash(data.normalId) && sourceModes.every(mode => {
    const item = data.modes?.[mode];
    return item && typeof item.available === 'boolean' && (!item.available || hash(item.snapshotId)
      && item.instructions && ['saved','minimal','custom','none','unmanaged'].includes(item.instructions.style)
      && typeof item.instructions.readable === 'boolean' && Array.isArray(item.skills) && item.skills.every(s => s && typeof s.id === 'string'
        && typeof s.label === 'string' && ['automatic','manual','disabled','unknown'].includes(s.state) && typeof s.requiredControl === 'boolean')
      && Array.isArray(item.plugins) && item.plugins.every(p => typeof p.label === 'string' && typeof p.enabled === 'boolean'));
  });
}
export function ModeContents({ controller: c, visible }: { controller: ReturnType<typeof useSourceController>; visible: boolean }) {
  const source = c.view?.source;
  const context = JSON.stringify([c.view?.metadata.launchId,c.view?.metadata.contextId,source?.registration.scopeId,source?.registration.activeNormalId,source?.setup?.setupId]);
  const [data, setData] = useState<{ context: string; value: Contents } | null>(null), [error, setError] = useState('');
  const [body, setBody] = useState<Body | null>(null), [bodyError, setBodyError] = useState('');
  const [bodyPending, setBodyPending] = useState(false);
  const bodyPanel = useRef<HTMLElement>(null);
  const latest = useRef({ c, context }), generation = useRef(0), bodyGeneration = useRef(0);
  latest.current = { c, context };
  const contents = data?.context === context ? data.value : null;
  async function load() {
    const key = latest.current.context, ticket = ++generation.current;
    setError(''); setData(null);
    const response = await latest.current.c.executeAuxiliary<Contents>('mode-contents', {});
    if (generation.current !== ticket || latest.current.context !== key) return;
    const source = latest.current.c.view?.source;
    if (response.status === 'failed' && response.error instanceof ApiError && response.error.kind === 'request-superseded') return;
    if (response.status !== 'completed' || !valid(response.result) || response.result.scopeId !== source?.registration.scopeId
      || response.result.normalId !== source.registration.activeNormalId || response.result.setupId !== (source.setup?.setupId ?? null)) {
      setError(t('保存した構成を読み込めませんでした。設定画面からも確認できます。', 'Saved contents could not be loaded. You can also inspect them in Settings.')); return;
    }
    setData({ context: key, value: response.result });
  }
  useEffect(() => {
    if (visible && source && !contents && !c.busy) void load();
    return () => { ++generation.current; ++bodyGeneration.current; };
  }, [context, visible, c.busy]);
  useEffect(() => { ++bodyGeneration.current; setBody(null); setBodyError(''); setBodyPending(false); }, [context, c.selected]);
  useEffect(() => { if (c.busy) { ++bodyGeneration.current; setBodyPending(false); } }, [c.busy]);
  useEffect(() => { if (body) bodyPanel.current?.scrollIntoView({ block: 'nearest' }); }, [body]);
  const mode = contents?.modes[c.selected];
  async function read(sourceId: string) {
    if (!mode?.available) return;
    const key = context, selected = c.selected, snapshotId = mode.snapshotId, ticket = ++bodyGeneration.current;
    setBody(null); setBodyError(''); setBodyPending(true);
    const response = await c.executeAuxiliary<Body>('mode-source', { mode: selected, snapshotId, sourceId });
    if (ticket !== bodyGeneration.current || key !== latest.current.context || selected !== latest.current.c.selected) return;
    setBodyPending(false);
    if (response.status !== 'completed' || response.result.scopeId !== contents?.scopeId || response.result.mode !== selected
      || response.result.snapshotId !== snapshotId || response.result.sourceId !== sourceId || typeof response.result.text !== 'string') {
      setBodyError(t('本文を読み込めませんでした。構成を読み直してください。', 'Could not load the text. Refresh the saved contents.')); return;
    }
    setBody(response.result);
  }
  return <section className="mode-contents" aria-label={t('このモードの内容', 'Contents of this mode')}>
    <div className="mode-contents-heading"><h1>{modeHeading(c.selected)}{t('の内容', ' contents')}</h1><span>{t('保存済みの構成', 'Saved configuration')}</span></div><p className="muted mode-read-only">{t('見るだけでは設定は変わりません。', 'Viewing does not change settings.')}</p>
    {source?.conflict && <p className="mode-contents-state">{t('保存内容を表示しています。今の設定との差分は、切替前に確認します。', 'Showing saved contents. Current differences are checked before switching.')}</p>}
    {c.selected !== 'normal' && !source?.conflict && source?.setup?.setupId && source.setup.preparedSetupId !== source.setup.setupId && <p className="mode-contents-state">{t('この保存内容は、まだ次のタスク用に準備されていません。', 'These saved contents have not been prepared for the next task yet.')}</p>}
    {error ? <p role="alert">{error} <button className="text-button" onClick={() => void load()} disabled={c.busy}>{t('読み直す', 'Retry')}</button></p>
      : !mode ? <p role="status">{t('保存した構成を確認しています…', 'Loading saved contents…')}</p>
      : !mode.available ? <p>{t('このモードの構成はまだ保存されていません。「その他 → 設定」からAIに相談できます。', 'This mode has no saved configuration yet. Consult AI through More → Settings.')}</p>
      : <>
        <div className="mode-instructions"><h3>{t('追加指示 · AGENTS.md', 'Optional instructions · AGENTS.md')}</h3><strong>{instructionLabel(mode.instructions.style)}</strong>
          {mode.instructions.readable && mode.instructions.sourceId && <button className="text-button" disabled={c.busy} onClick={() => void read(mode.instructions.sourceId!)}>{t('指示の本文を読む', 'Read instruction text')}</button>}
          {mode.instructions.style === 'none' && <p className="muted">{t('登録したグローバル追加指示を使いません。プロジェクトの指示は残ります。', 'Registered global optional instructions are not used. Project instructions remain.')}</p>}
        </div>
        <div className="mode-skill-groups"><h3>{t('切替対象のSkills', 'Skills in this configuration')}</h3>
          {(['automatic','manual','disabled','unknown'] as const).map(state => {
            const items = mode.skills.filter(s => s.state === state && !s.requiredControl);
            if (state === 'unknown' && !items.length) return null;
            const names = (rows: Skill[]) => <ul>{rows.map(s => <li key={s.id}><button className="mode-skill-name" disabled={c.busy} onClick={() => void read(s.id)} title={t('保存したSkillの本文を読む', 'Read saved Skill text')}>{s.label}</button></li>)}</ul>;
            return <div className={'mode-skill-group '+state} key={state}><div><strong>{labels()[state]}</strong><span>{items.length}{t('件', '')}</span></div>
              {items.length <= 5 ? items.length ? names(items) : <p className="muted">{t('なし', 'None')}</p>
                : <>{names(items.slice(0, 3))}<details><summary>{t(`残り${items.length - 3}件を見る`, `Show ${items.length - 3} more`)}</summary>{names(items.slice(3))}</details></>}
            </div>;
          })}
        </div>
        <p className="mode-kept-note">{t('プロジェクトの指示・メモリ・権限・Unharnessの管理機能は残ります。', 'Project instructions, memory, permissions and Unharness controls remain.')}</p>
        <details className="mode-retained"><summary>{t('すべてのモードで残るもの', 'What stays in every mode')}</summary>
          <p>{t('プロジェクトの指示、メモリ、権限、Unharnessの管理・復旧機能は保持します。ここで表示しているのは登録した追加設定です。', 'Project instructions, memory, permissions and Unharness management/recovery remain. This view covers registered optional settings.')}</p>
          {mode.skills.filter(s => s.requiredControl).map(s => <p key={s.id}>{s.label} · {labels()[s.state]}</p>)}
          {mode.plugins.length > 0 && <><h4>{t('プラグインの保存状態', 'Saved plugin states')}</h4><ul>{mode.plugins.map(p => <li key={p.id}>{p.label} · {p.enabled ? t('有効', 'Enabled') : t('無効', 'Disabled')}</li>)}</ul><p>{t('公式プラグインの個別停止が未対応の範囲では、Normalの状態を保持します。', 'Official plugins keep their Normal state where individual disablement is unsupported.')}</p></>}
        </details>
      </>}
    {bodyPending && <p role="status">{t('本文を確認しています…', 'Loading saved text…')}</p>}
    {bodyError && <p role="alert">{bodyError}</p>}
    {body && body.mode === c.selected && body.snapshotId === mode?.snapshotId && <section ref={bodyPanel} className="mode-source-body" aria-label={t('保存した本文', 'Saved source text')}><div><h3>{mode?.instructions.sourceId === body.sourceId ? instructionLabel(mode.instructions.style) : mode?.skills.find(s => s.id === body.sourceId)?.label}</h3><button className="text-button" onClick={() => setBody(null)}>{t('本文を閉じる', 'Close text')}</button></div><pre>{body.text}</pre></section>}
  </section>;
}
