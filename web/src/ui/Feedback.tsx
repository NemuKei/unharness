import type { ReactNode } from 'react';

export function StatusNotice({ tone = 'neutral', children, className = '' }: {
  tone?: 'neutral' | 'success' | 'warning' | 'error';
  children: ReactNode;
  className?: string;
}) {
  return <div className={`ui-notice ${tone} ${className}`.trim()} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="ui-empty"><strong>{title}</strong>{children}</div>;
}

export function LoadingState({ children }: { children: ReactNode }) {
  return <p className="ui-loading" role="status" aria-live="polite">{children}</p>;
}
