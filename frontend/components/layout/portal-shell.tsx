import type { ReactNode } from 'react';
export function PortalShell({
  header,
  children,
  theme = 'light',
  dir,
  presentation = 'page',
  skipLabel,
}: {
  header: ReactNode;
  children: ReactNode;
  theme?: 'light' | 'dark';
  dir: 'rtl' | 'ltr';
  presentation?: 'page' | 'embedded';
  skipLabel?: string;
}) {
  const Content = presentation === 'page' ? 'main' : 'section';
  return (
    <div
      className="rv-root raak-portal"
      data-theme={theme}
      data-presentation={presentation}
      dir={dir}
    >
      {presentation === 'page' && skipLabel ? (
        <a className="rv-skip" href="#raak-main">
          {skipLabel}
        </a>
      ) : null}
      <header className="raak-portal-header">{header}</header>
      <Content
        className="raak-portal-main"
        id={presentation === 'page' ? 'raak-main' : undefined}
        tabIndex={-1}
      >
        {children}
      </Content>
    </div>
  );
}
