import type { ReactNode } from 'react';
export function WorkspaceShell({
  sidebar,
  children,
  theme,
  dir,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  theme: 'light' | 'dark';
  dir: 'rtl' | 'ltr';
}) {
  return (
    <div className="rv-root" data-theme={theme} dir={dir}>
      {sidebar}
      <div className="rv-body">{children}</div>
    </div>
  );
}
