'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { apiRequest } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '../../components/ui/dialog';
import { Feedback } from '../../components/ui/feedback';
import { StatusBadge } from '../../components/ui/status-badge';
import { CatalogFrame } from './frame';
import { WorkspaceNav } from './workspace-nav';
import { catalogCopy, localized } from './copy';
import type { RequestView } from './contracts';

export function RequestQueue({ locale }: { locale: Locale }) {
  const opener = useRef<HTMLButtonElement | null>(null);
  const c = catalogCopy(locale);
  const [rows, setRows] = useState<RequestView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<RequestView | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const [notifications, setNotifications] = useState(0);
  async function load(next?: string) {
    const [data, notices] = await Promise.all([
      apiRequest<{ items: RequestView[]; nextCursor: string | null }>(
        `/agency/requests${next ? `?cursor=${next}` : ''}`,
      ),
      apiRequest<unknown[]>('/notifications'),
    ]);
    setRows(data.items);
    setCursor(data.nextCursor);
    setNotifications(notices.length);
  }
  useEffect(() => {
    void load().catch(() => setMessage(c.error));
  }, [c.error]);
  function inspect(id: string) {
    startTransition(async () => {
      try {
        setSelected(await apiRequest<RequestView>(`/agency/requests/${id}`));
        setOpen(true);
      } catch {
        setMessage(c.error);
      }
    });
  }
  return (
    <CatalogFrame locale={locale} path="/workspace/requests">
      <WorkspaceNav locale={locale} />
      <h1>{c.queue}</h1>
      <p>
        {c.notifications}: <bdi>{notifications}</bdi>
      </p>
      {message ? <Feedback title={message} /> : null}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await load();
            } catch {
              setMessage(c.error);
            }
          })
        }
      >
        {c.refresh}
      </Button>
      {rows.length ? (
        rows.map((r) => (
          <article className="raak-card" key={r.id}>
            <h2>{localized(r.serviceSnapshot, locale)}</h2>
            <bdi>{r.reference}</bdi>
            <StatusBadge tone={r.status === 'UNDER_REVIEW' ? 'in_progress' : 'planned'}>
              {c[r.status as 'SUBMITTED']}
            </StatusBadge>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={(event) => {
                opener.current = event.currentTarget;
                inspect(r.id);
              }}
            >
              {c.detail}
            </Button>
          </article>
        ))
      ) : (
        <Feedback title={c.noRequests} />
      )}
      {cursor ? (
        <Button
          variant="secondary"
          onClick={() =>
            startTransition(async () => {
              try {
                await load(cursor);
              } catch {
                setMessage(c.error);
              }
            })
          }
        >
          {c.next}
        </Button>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
        >
          <div className="rv-dialog-header">
            <div>
              <DialogTitle>{c.detail}</DialogTitle>
              <DialogDescription>{selected?.reference}</DialogDescription>
            </div>
            <DialogClose asChild>
              <Button variant="ghost">{c.close}</Button>
            </DialogClose>
          </div>
          <div className="rv-dialog-body">
            {selected ? (
              <>
                <h2>{localized(selected.serviceSnapshot, locale)}</h2>
                <p>
                  {selected.requesterName} ·{' '}
                  <bdi dir="ltr">{selected.requesterEmailNormalized}</bdi>
                </p>
                <p>
                  {c.beneficiaryName}: {selected.beneficiaryName}
                </p>
                <p>
                  {selected.areaId} · <bdi>{selected.preferredWindowJson?.date}</bdi>
                </p>
                <p>{selected.notesRestricted}</p>
                <StatusBadge tone={selected.status === 'UNDER_REVIEW' ? 'in_progress' : 'planned'}>
                  {c[selected.status as 'SUBMITTED']}
                </StatusBadge>
              </>
            ) : null}
          </div>
          <div className="rv-dialog-footer">
            {selected?.status === 'SUBMITTED' ? (
              <Button
                disabled={pending}
                aria-busy={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await apiRequest(`/agency/requests/${selected.id}/start-review`, {
                        method: 'POST',
                        body: JSON.stringify({ expectedVersion: selected.version }),
                      });
                      setSelected(await apiRequest(`/agency/requests/${selected.id}`));
                      await load();
                    } catch {
                      setMessage(c.error);
                      setOpen(false);
                    }
                  })
                }
              >
                {c.startReview}
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </CatalogFrame>
  );
}
