import { useEffect, useRef, useState } from 'react';
import { Api, ApiError, errorMessage, RequestGeneration } from './api';
import { Hangar } from './Hangar';
import { caseOrder, conditions, shortId } from './types';
import type { State, Favorite, Checkpoint, Plan, FavoritePage, CheckpointPage, Envelope, Application, Observation, FixtureCase } from './types';

const readyPrompt = 'This is the read-only Unharness desktop fixture check. Do not call tools or read files. Reply exactly READY.';
const sourceLabels: Record<string, string> = { 'project-instructions': 'プロジェクトの指示', 'fixed-override': '固定指示の優先ファイル', 'diagnostic-skill': '検証用Skill', 'skill-policy': 'Skillの自動選択設定' };
const uuidPattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
function displayPreference() { try { return localStorage.getItem('unharness.effects.v1') !== 'off'; } catch { return false; } }

export function App() {
  const api = useRef(new Api()).current;
  const planGeneration = useRef(new RequestGeneration()).current;
  const alive = useRef(true);
  const busyRef = useRef(false);
  const [state, setState] = useState<State | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('ローカルの検証環境に接続しています。');
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [favoriteCursor, setFavoriteCursor] = useState<string | null>(null);
  const [checkpointCursor, setCheckpointCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Favorite | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [name, setName] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [effects, setEffects] = useState(displayPreference);
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const shownCase: FixtureCase = selected?.case ?? state?.current?.case ?? 'baseline';
  const condition = conditions[shownCase];
  const canChange = connected && !busy && !!state?.current && !state.conflict;

  function invalidatePlan() { planGeneration.next(); setPlan(null); setPlanning(false); }
  function reportError(reason: unknown) {
    setError(errorMessage(reason));
    if (reason instanceof ApiError && reason.checkpointId) setRecoveryId(reason.checkpointId);
    if (reason instanceof ApiError && ['connection-lost', 'invalid-response'].includes(reason.kind)) setConnected(false);
  }
  async function refresh() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy('refresh'); invalidatePlan(); setError('');
    try {
      await api.connect();
      const [next, saved, recovery] = await Promise.all([api.get<State>('/state'), api.get<FavoritePage>('/favorites'), api.get<CheckpointPage>('/checkpoints')]);
      if (!alive.current) return;
      setState(next); setFavorites(saved.favorites); setFavoriteCursor(saved.nextCursor);
      setCheckpoints(recovery.checkpoints); setCheckpointCursor(recovery.nextCursor); setConnected(true);
      setNotice('準備状態を取得しました。選択後に変更計画を確認できます。');
    } catch (reason) { if (alive.current) { setConnected(false); reportError(reason); } }
    finally { busyRef.current = false; if (alive.current) setBusy(null); }
  }
  useEffect(() => { alive.current = true; void refresh(); return () => { alive.current = false; planGeneration.next(); }; }, []);

  async function choose(favorite: Favorite) {
    if (busyRef.current || !connected) return;
    setSelected(favorite); setPlan(null); setPlanning(true); setError('');
    const generation = planGeneration.next();
    try {
      const response = await api.post<Envelope<Plan>>('/plan', { favoriteId: favorite.favoriteId });
      if (!alive.current || !planGeneration.isCurrent(generation)) return;
      setState(response.state); setPlan(response.result); setNotice('選択した保存版の変更計画です。適用すると次のタスク向けの設定を準備します。');
    } catch (reason) { if (alive.current && planGeneration.isCurrent(generation)) reportError(reason); }
    finally { if (alive.current && planGeneration.isCurrent(generation)) setPlanning(false); }
  }
  async function mutate<T>(route: string, body: object, message: string) {
    if (busyRef.current || !connected) return;
    busyRef.current = true; setBusy(route); invalidatePlan(); setError(''); setNotice('操作中です。完了までお待ちください。');
    try {
      const response = await api.post<Envelope<T>>(route, body);
      if (!alive.current) return;
      setState(response.state); setNotice(message);
      if (route === '/save') {
        const saved = response.result as Favorite;
        setFavorites(current => [saved, ...current.filter(item => item.favoriteId !== saved.favoriteId)]); setName('');
      }
      if (route === '/apply' || route === '/restore-checkpoint') {
        setRecoveryId((response.result as Application).checkpointId);
        // A fresh first page plus paging exposes checkpoints created by this operation.
        try {
          const page = await api.get<CheckpointPage>('/checkpoints');
          if (alive.current) { setCheckpoints(page.checkpoints); setCheckpointCursor(page.nextCursor); }
        } catch (reason) { if (alive.current) reportError(reason); }
      }
    } catch (reason) {
      if (alive.current) { reportError(reason); setNotice('操作の成功は確認できていません。状態を再取得してください。'); setConnected(false); }
    } finally { busyRef.current = false; if (alive.current) setBusy(null); }
  }
  async function loadMore(kind: 'favorites' | 'checkpoints') {
    const cursor = kind === 'favorites' ? favoriteCursor : checkpointCursor;
    if (!cursor || busyRef.current || !connected) return;
    busyRef.current = true; setBusy(kind); setError('');
    try {
      if (kind === 'favorites') {
        const page = await api.get<FavoritePage>(`/favorites?after=${encodeURIComponent(cursor)}`);
        if (!alive.current) return;
        setFavorites(current => [...current, ...page.favorites.filter(item => !current.some(known => known.favoriteId === item.favoriteId))]); setFavoriteCursor(page.nextCursor);
      } else {
        const page = await api.get<CheckpointPage>(`/checkpoints?after=${encodeURIComponent(cursor)}`);
        if (!alive.current) return;
        setCheckpoints(current => [...current, ...page.checkpoints.filter(item => !current.some(known => known.checkpointId === item.checkpointId))]); setCheckpointCursor(page.nextCursor);
      }
    } catch (reason) { if (alive.current) reportError(reason); }
    finally { busyRef.current = false; if (alive.current) setBusy(null); }
  }
  function setDisplayEffects(value: boolean) { setEffects(value); try { localStorage.setItem('unharness.effects.v1', value ? 'on' : 'off'); } catch { /* Optional display preference. */ } }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setNotice('クリップボードにコピーしました。'); } catch { setError('コピーできませんでした。表示されたテキストを選択してコピーしてください。'); } }
  const observationText = state?.observation ? {
    'matched-record': '記録内の検証用入力が一致しました。',
    'not-matched-record': '記録内の検証用入力が一致しませんでした。',
    'unqualified-record': 'この記録は確認条件を満たしていません。',
  }[state.observation.fixtureMarkerCheck] : 'タスクの記録はまだ確認していません。';

  return <div className="app-shell">
    <header className="topbar"><a className="wordmark" href="#main">UNHARNESS<span>装備を見直す。</span></a><div className="header-right"><span className="scope-label">専用の検証環境</span><label className="effects"><input type="checkbox" checked={effects} onChange={event => setDisplayEffects(event.target.checked)} />演出 <span>{effects ? 'ON' : 'OFF'}</span></label></div></header>
    <main id="main">
      <div className="hangar-layout">
        <section className="visual-column" aria-label="選択した確認条件">
          <div className="scene-heading"><p className="eyebrow">装備変更 <span>／ 選択プレビュー</span></p><h1>{condition.title}</h1><p className="scene-subtitle">{condition.label}</p><p className="scene-description">{condition.description}</p></div>
          <Hangar condition={shownCase} effects={effects} />
          <p className="scene-caption">姿は選択条件のプレビューです。実行中のタスクの状態を表すものではありません。</p>
          <div className="mode-selector" aria-label="確認条件の選択">{caseOrder.map((key, index) => {
            const favorite = favorites.find(item => item.case === key);
            return <button key={key} aria-pressed={shownCase === key} disabled={!favorite || !connected || !!busy} onClick={() => favorite && void choose(favorite)}><span className="mode-icon" aria-hidden="true">{['▣', '◇', '✧'][index]}</span><span><strong>{conditions[key].title}</strong><small>{conditions[key].label}</small></span></button>;
          })}</div>
        </section>
        <aside className="control-column" aria-label="設定と保存">
          <section className="control-section"><p className="eyebrow">準備状態</p><div className="current-heading"><h2>{state?.current ? conditions[state.current.case].label : '状態を確認中'}</h2><span className={connected ? 'connection' : 'connection disconnected'}>{connected ? '接続中' : '未接続'}</span></div>
            <p className="muted">{state?.current ? `準備版 ${state.current.revision} · 設定 ${shortId(state.current.configurationDigest)}` : '検証用の設定だけを読み取ります。'}</p>
            <p className="boundary">{!state?.application ? 'この起動ではまだ適用していません。' : state.applicationCurrent ? '設定の読み戻しは一致。新しいタスクで記録の確認が必要です。' : '適用後に準備状態が変わっています。再度、変更計画を確認してください。'}</p>
            {state?.conflict && <p role="alert" className="error">検証環境に競合があります（{state.conflict}）。外部の変更を確認してください。</p>}
            <button className="text-button" disabled={!!busy} onClick={() => void refresh()}>↻ 状態を再取得</button>
          </section>
          <section className="control-section plan-section"><div className="section-heading"><h2>変更計画</h2><span>選択した保存版</span></div>
            {selected ? <p className="selected-name">{selected.name || conditions[selected.case].label} <code title={selected.favoriteId}>{shortId(selected.favoriteId)}</code></p> : <p className="muted">下の確認条件か、お気に入りを選択してください。</p>}
            <dl className="source-list"><div><dt>検証用Skill</dt><dd>{condition.skill}</dd></div><div><dt>追加の指示</dt><dd>{condition.procedure}</dd></div><div><dt>固定指示</dt><dd>維持</dd></div></dl>
            <p className="tiny">上記は選択条件の予定です。個人設定・管理ポリシー・権限は変更しません。</p>
            <div className="plan-detail" aria-live="polite">{planning ? <p>変更計画を読み込んでいます…</p> : plan ? <><p>{plan.changedSources.length ? '変更する検証用ファイル' : '設定内容の差分なし。次のタスク向けに準備を更新します。'}</p>{plan.changedSources.length > 0 && <ul>{plan.changedSources.map(source => <li key={source}>{sourceLabels[source] ?? source}</li>)}</ul>}<code title={plan.planId}>計画 {shortId(plan.planId)}</code></> : selected ? <p>適用前に変更計画を再確認してください。</p> : null}</div>
            {selected && !plan && !planning && <button className="secondary wide" disabled={!canChange} onClick={() => void choose(selected)}>変更計画を確認</button>}
            <button className="primary wide" disabled={!canChange || !selected || !plan || planning || plan.target.id !== selected.favoriteId} onClick={() => selected && plan && void mutate<Application>('/apply', { favoriteId: selected.favoriteId, planId: plan.planId }, '選択した保存版の設定を準備しました。新しいローカルタスクで記録を確認してください。')}><span aria-hidden="true">›</span> {busy === '/apply' ? '設定を準備中…' : 'この条件を準備する'}</button>
          </section>
          <section className="control-section save-section"><form onSubmit={event => { event.preventDefault(); void mutate<Favorite>('/save', { name: name.trim() || null }, '現在の準備済み設定をお気に入りに保存しました。'); }}><label htmlFor="favorite-name">保存名 <span>任意</span></label><input id="favorite-name" value={name} maxLength={120} onChange={event => setName(event.target.value)} placeholder="例：いつもの確認条件" disabled={!!busy}/><button className="secondary wide" disabled={!canChange} type="submit"><span className="star" aria-hidden="true">☆</span> {busy === '/save' ? '保存中…' : '今の設定をお気に入りに保存'}</button><p className="tiny">保存するのは現在の準備状態です。選択プレビューとは異なる場合があります。</p></form></section>
        </aside>
      </div>
      <div className="status-strip"><span className="status-symbol" aria-hidden="true">◇</span><div role="status" aria-live="polite">{notice}</div><span className="evidence-status">実行中の状態・モード切替：未検証</span></div>
      {error && <div className="global-error" role="alert">{error}{recoveryId && <span> 復帰点：<code>{shortId(recoveryId)}</code></span>}</div>}
      <div className="records-grid">
        <section className="records-section"><div className="section-heading"><h2>お気に入り</h2><span>設定内容を保存した版</span></div>{favorites.length ? <ul className="record-list">{favorites.map(favorite => <li key={favorite.favoriteId}><button aria-pressed={selected?.favoriteId === favorite.favoriteId} disabled={!connected || !!busy} onClick={() => void choose(favorite)}><span className="star" aria-hidden="true">☆</span><span className="record-name">{favorite.name || conditions[favorite.case].label}<small>{conditions[favorite.case].title} · {shortId(favorite.favoriteId)}</small></span><span aria-hidden="true">›</span></button></li>)}</ul> : <p className="muted">保存版はまだありません。現在の設定から保存できます。</p>}{favoriteCursor && <button className="secondary" disabled={!connected || !!busy} onClick={() => void loadMore('favorites')}>さらにお気に入りを読み込む</button>}</section>
        <section className="records-section"><div className="section-heading"><h2>変更前に戻す</h2><span>自動保存された復帰点</span></div><p className="muted">復帰時も独立した編集を保護します。強制的な上書きは行いません。</p>{checkpoints.length ? <ul className="record-list">{checkpoints.map(checkpoint => <li className="checkpoint-row" key={checkpoint.checkpointId}><span className="record-name">{conditions[checkpoint.case].label}<small>準備版 {checkpoint.capturedPreparation} · {shortId(checkpoint.checkpointId)}{checkpoint.checkpointId === recoveryId ? ' · 直前の復帰点' : ''}</small></span><button className="secondary" disabled={!canChange} onClick={() => void mutate<Application>('/restore-checkpoint', { checkpointId: checkpoint.checkpointId }, '復帰点の設定を準備しました。実行中のタスクの状態は変わりません。')}>復帰する</button></li>)}</ul> : <p className="muted">条件を準備すると、変更前の設定がここに残ります。</p>}{checkpointCursor && <button className="secondary" disabled={!connected || !!busy} onClick={() => void loadMore('checkpoints')}>さらに復帰点を読み込む</button>}</section>
      </div>
      <section className="handoff-section"><div className="section-heading"><h2>新しいタスクで確かめる</h2><span>Codex ローカルタスク</span></div><p className="muted">条件を準備した後、以下のプロジェクトで新しいローカルタスクを作成し、確認文を送ります。</p><div className="handoff-grid"><div><label htmlFor="project-path">検証用プロジェクト</label><textarea id="project-path" readOnly rows={2} value={state?.project ?? ''}/><button className="text-button" disabled={!state?.project} onClick={() => state && void copy(state.project)}>プロジェクトの場所をコピー</button><label htmlFor="ready-prompt">確認文</label><textarea id="ready-prompt" readOnly rows={3} value={readyPrompt}/><button className="text-button" onClick={() => void copy(readyPrompt)}>確認文をコピー</button></div><div><form onSubmit={event => { event.preventDefault(); if (state?.application) void mutate<Observation>('/observe', { applicationId: state.application.applicationId, sessionId: sessionId.trim() }, '選択したタスクの記録を確認しました。'); }}><label htmlFor="session-id">作成したタスクのUUID</label><input id="session-id" value={sessionId} onChange={event => setSessionId(event.target.value)} required pattern={uuidPattern} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoComplete="off" spellCheck={false} disabled={!!busy}/><p className="tiny">ファイルパスではなく、確認に使ったタスクのIDを入力してください。</p><button className="secondary wide" type="submit" disabled={!canChange || !state?.application || !state.applicationCurrent || !sessionId.trim()}>{busy === '/observe' ? '記録を確認中…' : 'このタスクの記録を確認'}</button></form><div className="observation"><h3>記録による確認</h3><p>{state?.observation && !state.applicationCurrent ? "以前の準備状態についての記録です。" : ""}{observationText}</p>{state?.observation && <code>{state.observation.fixtureMarkerCheck}</code>}<p className="tiny">一致は、その記録内の検証用入力についての確認です。実行中のハーネス全体や完全なモード切替を保証しません。</p></div></div></div></section>
      <footer><span>UNHARNESS <span className="muted">/ LOCAL FIXTURE GUI</span></span><details><summary>AIを使わない復帰と保存先</summary><p>CLIの loadouts checkpoints / restore-checkpoint からも復帰できます。同じ保存先と復帰点IDを指定してください。</p><dl><dt>保存先</dt><dd>{state?.store ?? '未取得'}</dd><dt>検証環境</dt><dd>{state?.fixture ?? '未取得'}</dd><dt>スコープ</dt><dd>{state?.scopeId ?? '未取得'}</dd></dl></details></footer>
    </main>
  </div>;
}
