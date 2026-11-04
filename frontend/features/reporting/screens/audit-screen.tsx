'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '../../../lib/i18n';
import { LOCALE_DIRECTION } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import { Feedback } from '../../../components/ui/feedback';
import { formatDateTime } from '../../../lib/date-time';
import { useWorkspaceQuery } from '../../../lib/use-workspace-query';
import { auditError, reportingCopy } from '../copy';
import { getAuditPage } from '../api';
import type { AuditPageData } from '../contracts';
import '../reporting.css';
import '../../../components/layout/visit-flow.css';

/** Append-only audit trail view (docs 06/07): safe summaries only, cursor
 * pagination held in the URL. Owners/Admins; other audiences get a generic
 * denial message rather than any entry content. */
export function AuditScreen({ locale }: { locale: Locale }) {
  const c = reportingCopy(locale);
  const { search, update } = useWorkspaceQuery();
  const cursorParam = new URLSearchParams(search).get('cursor') ?? '';
  const [page, setPage] = useState<AuditPageData | null>(null);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'info' | 'error'>('info');
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const load = useCallback(
    async (cursor: string, signal?: AbortSignal) => {
      const requestId = ++generation.current;
      setLoading(true);
      setMessage('');
      try {
        const data = await getAuditPage(cursor || null, signal);
        if (generation.current === requestId) {
          setPage(data);
          if (data.items.length === 0 && cursor) {
            setTone('info');
            setMessage(c.auditEmpty);
          }
        }
      } catch (cause) {
        if (signal?.aborted || generation.current !== requestId) return;
        setTone('error');
        setMessage(auditError(c, cause));
        setPage(null);
      } finally {
        if (generation.current === requestId) setLoading(false);
      }
    },
    [c],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(cursorParam, controller.signal);
    return () => controller.abort();
  }, [cursorParam, load]);

  const actorLabel = (entry: { actorType: string | null }) => {
    if (!entry.actorType) return '—';
    const key = entry.actorType as keyof typeof c.actors;
    return c.actors[key] ?? entry.actorType;
  };

  return (
    <section className="raak-execution" dir={LOCALE_DIRECTION[locale]}>
      <div className="rv-page-heading">
        <div>
          <h1>{c.auditTitle}</h1>
          <p>{c.auditIntro}</p>
        </div>
        <div className="raak-actions">
          <Button
            variant="secondary"
            disabled={!cursorParam}
            onClick={() => update({ cursor: null })}
          >
            {c.first}
          </Button>
          <Button
            variant="secondary"
            disabled={!page?.nextCursor}
            onClick={() => page?.nextCursor && update({ cursor: page.nextCursor })}
          >
            {c.next}
          </Button>
        </div>
      </div>
      {message ? <Feedback tone={tone} title={message} /> : null}
      {loading ? <Feedback title={c.auditLoading} /> : null}
      {page && page.items.length > 0 ? (
        <div className="raak-card">
          <div className="rv-table-scroll" tabIndex={0} role="region" aria-label={c.auditTitle}>
            <table className="rv-table raak-report-table">
              <thead>
                <tr>
                  <th scope="col">{c.time}</th>
                  <th scope="col">{c.actor}</th>
                  <th scope="col">{c.action}</th>
                  <th scope="col">{c.subject}</th>
                  <th scope="col">{c.reason}</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((entry) => (
                  <tr key={entry.id} data-audit-row={entry.id}>
                    <td>
                      <bdi>{formatDateTime(entry.at, locale, page.timezone)}</bdi>
                    </td>
                    <td>
                      {actorLabel(entry)}
                      {entry.actorId ? (
                        <>
                          {' '}
                          <bdi>{entry.actorId.slice(0, 8)}</bdi>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <bdi>{entry.action}</bdi>
                    </td>
                    <td>
                      <bdi>{entry.subjectType}</bdi>
                      {entry.subjectId ? (
                        <>
                          {' '}
                          <bdi dir="ltr">{entry.subjectId}</bdi>
                        </>
                      ) : null}
                    </td>
                    <td>{entry.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {!loading && !message && page && page.items.length === 0 ? (
        <Feedback title={c.auditEmpty} />
      ) : null}
    </section>
  );
}
