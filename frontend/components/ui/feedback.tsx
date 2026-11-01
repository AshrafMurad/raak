import type { ReactNode } from 'react';
export function Feedback({
  title,
  children,
  tone = 'info',
  className = '',
}: {
  title?: string;
  children?: ReactNode;
  tone?: 'info' | 'error' | 'success';
  className?: string;
}) {
  return (
    <section
      className={`rv-feedback-example ${tone === 'error' ? 'rv-feedback-error' : tone === 'success' ? 'rv-feedback-recovered' : ''} ${className}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {title ? <h3>{title}</h3> : null}
      {children}
    </section>
  );
}
