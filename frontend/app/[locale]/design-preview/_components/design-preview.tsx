'use client';

import {
  Dialog as DialogRoot,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '../../../../components/ui/dialog';
import Link from 'next/link';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Layers3,
  LayoutDashboard,
  Menu,
  Moon,
  PanelLeft,
  Sun,
  X,
} from 'lucide-react';
import { useRef, useState, type MouseEvent } from 'react';
import { otherLocale, type Locale } from '../../../../lib/i18n';
import type { PreviewCopy, PreviewTheme } from '../../../../lib/design-preview';
import { Button } from '../../../../components/ui/button';
import { WorkspaceShell } from '../../../../components/layout/workspace-shell';
import { ComponentBoard } from './component-board';
import { VisitStatus } from './status';
import { usePreviewFeedback } from './use-preview-feedback';
import { Workspace, type InspectRecord } from './workspace';

type View = 'workspace' | 'system';

function Navigation({
  copy,
  view,
  setView,
}: {
  copy: PreviewCopy;
  view: View;
  setView: (view: View) => void;
}) {
  return (
    <nav className="rv-nav" aria-label={copy.navigation}>
      <button
        type="button"
        aria-current={view === 'workspace' ? 'page' : undefined}
        onClick={() => setView('workspace')}
      >
        <LayoutDashboard size={18} aria-hidden="true" />
        {copy.overview}
      </button>
      <a href="#attention" onClick={() => setView('workspace')}>
        <ClipboardList size={18} aria-hidden="true" />
        {copy.attentionNav}
        <span className="rv-nav-count">4</span>
      </a>
      <a href="#visits" onClick={() => setView('workspace')}>
        <CalendarDays size={18} aria-hidden="true" />
        {copy.visits}
      </a>
      <div className="rv-nav-separator" />
      <button
        type="button"
        aria-current={view === 'system' ? 'page' : undefined}
        onClick={() => setView('system')}
      >
        <Layers3 size={18} aria-hidden="true" />
        {copy.system}
        <span className="rv-nav-version" dir="ltr">
          v0.1
        </span>
      </button>
    </nav>
  );
}

export function DesignPreview({
  locale,
  copy,
  initialTheme,
}: {
  locale: Locale;
  copy: PreviewCopy;
  initialTheme: PreviewTheme;
}) {
  const [view, setView] = useState<View>('workspace');
  const [theme, setTheme] = useState(initialTheme);
  const [selected, setSelected] = useState<InspectRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const viewFeedback = usePreviewFeedback<HTMLDivElement>(view);
  const opener = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDetailsElement | null>(null);
  function changeView(next: View) {
    setView(next);
    if (menu.current?.open) {
      menu.current.open = false;
      menu.current.querySelector('summary')?.focus();
    }
  }
  function inspect(record: InspectRecord, event: MouseEvent<HTMLButtonElement>) {
    opener.current = event.currentTarget;
    setSelected(record);
    setDialogOpen(true);
  }
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    const url = new URL(window.location.href);
    if (next === 'dark') url.searchParams.set('theme', 'dark');
    else url.searchParams.delete('theme');
    window.history.replaceState(window.history.state, '', url);
  }
  const requestSelected = selected === 'request';
  const visit = selected && selected !== 'request' ? selected : null;
  const operationalNote =
    visit?.state === 'PLANNED'
      ? copy.planNote
      : visit?.state === 'COMPLETED'
        ? copy.completeNote
        : visit?.state === 'IN_PROGRESS'
          ? copy.progressNote
          : copy.scheduledNote;
  return (
    <DialogRoot open={dialogOpen} onOpenChange={setDialogOpen}>
      <WorkspaceShell
        theme={theme}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
        sidebar={
          <>
            <a href="#preview-main" className="rv-skip">
              {copy.skip}
            </a>
            <aside className="rv-sidebar">
              <div className="rv-wordmark">
                {copy.brand}
                <span>{locale === 'ar' ? 'Raak' : 'رعاك'}</span>
              </div>
              <div className="rv-agency">
                <span className="rv-agency-initial" aria-hidden="true">
                  {copy.agency.slice(0, 1)}
                </span>
                <div>
                  <strong>{copy.agency}</strong>
                  <small>{copy.agencyHint}</small>
                </div>
              </div>
              <Navigation copy={copy} view={view} setView={changeView} />
              <div className="rv-sidebar-bottom">
                <span className="rv-preview-mark">
                  <span aria-hidden="true" />
                  {copy.footer}
                </span>
                <div className="rv-profile">
                  <span className="rv-avatar">{copy.coordinatorInitial}</span>
                  <span>{copy.coordinator}</span>
                </div>
              </div>
            </aside>
          </>
        }
      >
        <header className="rv-header">
          <div className="rv-breadcrumb">
            <PanelLeft size={16} aria-hidden="true" />
            <span>{copy.workspace}</span>
            <ChevronRight size={13} className="rv-directional" aria-hidden="true" />
            <strong>{view === 'workspace' ? copy.overview : copy.system}</strong>
          </div>
          <div className="rv-header-actions">
            <span className="rv-header-date">{copy.date}</span>
            <Button
              variant="ghost"
              className="rv-theme-toggle"
              aria-label={theme === 'dark' ? copy.switchToLight : copy.switchToDark}
              title={theme === 'dark' ? copy.switchToLight : copy.switchToDark}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? (
                <Sun size={17} aria-hidden="true" />
              ) : (
                <Moon size={17} aria-hidden="true" />
              )}
              <span className="rv-theme-label" aria-hidden="true">
                <span data-active={theme === 'dark'}>{copy.themeLight}</span>
                <span data-active={theme === 'light'}>{copy.themeDark}</span>
              </span>
            </Button>
            <Link
              href={`/${otherLocale(locale)}/design-preview${theme === 'dark' ? '?theme=dark' : ''}`}
              lang={otherLocale(locale)}
              className="rv-language"
            >
              {copy.language}
            </Link>
          </div>
        </header>
        <details className="rv-mobile-nav" ref={menu}>
          <summary>
            <Menu size={18} aria-hidden="true" />
            {copy.brand}
            <span>{copy.menu}</span>
          </summary>
          <Navigation copy={copy} view={view} setView={changeView} />
        </details>
        <div className="rv-disclosure">
          <span>
            <span className="rv-disclosure-dot" aria-hidden="true" />
            {copy.preview}
          </span>
          <div className="rv-view-switch" aria-label={copy.preview}>
            <button
              type="button"
              aria-pressed={view === 'workspace'}
              onClick={() => changeView('workspace')}
            >
              {copy.workspace}
            </button>
            <button
              type="button"
              aria-pressed={view === 'system'}
              onClick={() => changeView('system')}
            >
              {copy.system}
            </button>
          </div>
        </div>
        <main id="preview-main" className="rv-main" tabIndex={-1}>
          <div className="rv-date-row">
            <span>{copy.date}</span>
            <bdi dir="ltr">{copy.timezone}</bdi>
          </div>
          <div ref={viewFeedback} className="rv-view-content">
            {view === 'workspace' ? (
              <Workspace
                copy={copy}
                onInspect={inspect}
                theme={theme}
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
              />
            ) : (
              <ComponentBoard
                copy={copy}
                onInspect={inspect}
                theme={theme}
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
              />
            )}
          </div>
          <footer className="rv-footer">
            <span>{copy.footer}</span>
            <span>{copy.footerHint}</span>
          </footer>
        </main>
      </WorkspaceShell>
      <DialogContent
        theme={theme}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
      >
        <div className="rv-dialog-header">
          <div>
            <DialogTitle>{requestSelected ? copy.requestDetail : copy.detail}</DialogTitle>
            <DialogDescription>{copy.detailHint}</DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label={copy.close}>
              <X size={20} aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>
        <div className="rv-dialog-body">
          <div className="rv-dialog-identity">
            <div>
              <span className="rv-dialog-ref">
                <bdi>{visit?.id ?? 'REQ-218'}</bdi>
              </span>
              <h2>{visit ? copy.people[visit.person] : copy.requestPerson}</h2>
            </div>
            {visit ? (
              <VisitStatus state={visit.state} copy={copy} />
            ) : (
              <span className="rv-status rv-status-planned">
                <ClipboardList size={13} aria-hidden="true" />
                {copy.requestState}
              </span>
            )}
          </div>
          <dl className="rv-detail-list">
            <div>
              <dt>{copy.service}</dt>
              <dd>{visit ? copy.services[visit.service] : copy.services.home}</dd>
            </div>
            {visit ? (
              <>
                <div>
                  <dt>{copy.window}</dt>
                  <dd>
                    <bdi dir="ltr">{visit.time}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>{copy.caregiver}</dt>
                  <dd>{visit.caregiver ? copy.caregivers[visit.caregiver] : copy.unassigned}</dd>
                </div>
              </>
            ) : null}
            <div>
              <dt>{copy.dateLabel}</dt>
              <dd>
                <bdi dir="ltr">2026-10-31</bdi>
              </dd>
            </div>
          </dl>
          <div className="rv-operational-note">
            <Check size={17} aria-hidden="true" />
            <div>
              <h3>{copy.notes}</h3>
              <p>{requestSelected ? copy.requestNote : operationalNote}</p>
            </div>
          </div>
        </div>
        <div className="rv-dialog-footer">
          <p>{copy.boundary}</p>
          <DialogClose asChild>
            <Button>
              {copy.understood}
              <ArrowUpRight size={16} className="rv-directional" aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
