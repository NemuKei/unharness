import { getLocale, text as t } from './locale.ts';
import { useRef } from 'react';

export type WorkbenchPage = 'mode' | 'settings' | 'appearance' | 'history' | 'support';
export function workbenchPageFromHash(hash: string): WorkbenchPage | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const page = params.get('view');
  return [...params.keys()].length === 1 && ['mode', 'settings', 'appearance', 'history', 'support'].includes(page ?? '') ? page as WorkbenchPage : null;
}
export function workbenchPageUrl(verifiedUrl: string, page: WorkbenchPage, supportsLanguage = true): string {
  const url = new URL(verifiedUrl); if (supportsLanguage) url.searchParams.set('lang', getLocale()); url.hash = new URLSearchParams({ view: page }).toString(); return url.href;
}

export function WorkbenchNavigation({ page, select }: { page: WorkbenchPage; select: (page: WorkbenchPage) => void }) {
  const more = useRef<HTMLDetailsElement>(null);
  const choose = (next: WorkbenchPage) => { select(next); if (more.current) more.current.open = false; };
  return <nav className="workbench-tabs workbench-navigation" aria-label={t("ワークベンチ", "Workbench")}>
    {([['mode', t("モード", "Mode")], ['settings', t("設定", "Settings")], ['appearance', t("外観", "Appearance")]] as const).map(([key, label]) =>
      <button key={key} type="button" aria-current={page === key ? 'page' : undefined} onClick={() => choose(key)}>{label}</button>)}
    <details className="workbench-more" ref={more}><summary>{t("その他", "More")}</summary><div>
      <button type="button" aria-current={page === 'history' ? 'page' : undefined} onClick={() => choose('history')}>{t("比較・記録", "Comparisons & records")}</button>
      <button type="button" aria-current={page === 'support' ? 'page' : undefined} onClick={() => choose('support')}>{t("接続・復旧", "Connection & recovery")}</button>
    </div></details>
  </nav>;
}
