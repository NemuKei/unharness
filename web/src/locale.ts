export type Locale = 'ja' | 'en';
const key = 'unharness.locale.v1';
function initialLocale(): Locale {
  if (typeof window === 'undefined') return 'ja';
  try {
    const requested = new URL(window.location.href).searchParams.get('lang');
    if (requested === 'ja' || requested === 'en') return requested;
    return window.localStorage.getItem(key) === 'en' ? 'en' : 'ja';
  } catch { return 'ja'; }
}
let locale = initialLocale();
const listeners = new Set<() => void>();
export const getLocale = () => locale;
export const subscribeLocale = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function setLocale(next: Locale) {
  if (next !== 'ja' && next !== 'en') return;
  locale = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('lang')) { url.searchParams.set('lang', next); history.replaceState(history.state, '', url); }
  } catch { /* Language controls do not require URL access. */ }
  try { localStorage.setItem(key, next); } catch { /* Keep this session usable. */ }
  for (const listener of listeners) listener();
}
export const text = (ja: string, en: string) => locale === 'en' ? en : ja;
