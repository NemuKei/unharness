import { useEffect, useSyncExternalStore } from 'react';
import { getLocale, setLocale, subscribeLocale } from './locale.ts';

export function useLocale() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => 'ja' as const);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  return locale;
}
export function LanguageSwitch() {
  const locale = useLocale();
  return <div className="language-switch" role="group" aria-label="Language / 言語">
    <button type="button" lang="ja" aria-pressed={locale === 'ja'} onClick={() => setLocale('ja')}>日本語</button>
    <button type="button" lang="en" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>English</button>
  </div>;
}
