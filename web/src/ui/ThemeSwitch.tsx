import { useEffect, useState } from 'react';
import { text as t } from '../locale.ts';

type Theme = 'system' | 'light' | 'dark';

function resolveSystemTheme() {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    const root = document.documentElement;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      root.dataset.theme = theme;
      root.dataset.resolvedTheme = theme === 'system' ? resolveSystemTheme() : theme;
    };
    apply();
    if (theme === 'system') media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return <div className="theme-switch" role="group" aria-label={t('表示テーマ', 'Display theme')}>
    {([['system', t('自動', 'System')], ['light', t('明色', 'Light')], ['dark', t('暗色', 'Dark')]] as const).map(([value, label]) =>
      <button type="button" key={value} aria-pressed={theme === value} onClick={() => setTheme(value)}>{label}</button>)}
  </div>;
}
