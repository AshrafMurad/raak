'use client';
import { useEffect, useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { apiRequest } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import { Field, Input } from '../../components/ui/field';
import { Feedback } from '../../components/ui/feedback';
import { PortalFrame } from '../../components/layout/portal-frame';
import { peopleCopy, peopleError, stateLabel } from './copy';
import type { Caregiver, PageResult } from './contracts';
import { CaregiverProfile } from './caregiver-profile';
import './people.css';

export function Caregivers({ locale, own = false }: { locale: Locale; own?: boolean }) {
  const c = peopleCopy(locale);
  const [rows, setRows] = useState<Caregiver[]>([]);
  const [selected, setSelected] = useState<Caregiver | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();
  useEffect(() => {
    let active = true;
    const requestedId = new URLSearchParams(window.location.search).get('caregiver');
    const load = own
      ? apiRequest<Caregiver>('/caregiver/my/profile').then((data) => {
          if (active) setSelected(data);
        })
      : apiRequest<PageResult<Caregiver>>('/agency/caregivers').then((data) => {
          if (active) {
            setRows(data.items);
            setCursor(data.nextCursor);
          }
        });
    if (!own && requestedId)
      void apiRequest<Caregiver>(`/agency/caregivers/${encodeURIComponent(requestedId)}`)
        .then((data) => {
          if (active) setSelected(data);
        })
        .catch((e: unknown) => {
          if (active) setMessage(peopleError(c, e));
        });
    load
      .catch((e: unknown) => {
        if (active) setMessage(peopleError(c, e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [own, c]);
  function inspect(id: string) {
    start(async () => {
      try {
        setSelected(await apiRequest<Caregiver>(`/agency/caregivers/${id}`));
        setMessage('');
      } catch (e) {
        setMessage(peopleError(c, e));
      }
    });
  }
  const content = (
    <div className="raak-people">
      <h1>{own ? c.ownProfile : c.caregivers}</h1>
      {!own ? (
        <>
          <p>{c.inviteHelp}</p>
          <form
            className="raak-card raak-form"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              start(async () => {
                try {
                  await apiRequest('/staff/invitations', {
                    method: 'POST',
                    body: JSON.stringify({
                      email: data.get('email'),
                      role: 'CAREGIVER',
                      caregiverProfile: {
                        name: data.get('name'),
                        professionalCategory: data.get('category'),
                      },
                    }),
                  });
                  setMessage(c.saved);
                } catch (error) {
                  setMessage(peopleError(c, error));
                }
              });
            }}
          >
            <h2>{c.invite}</h2>
            {(
              [
                ['email', c.email],
                ['name', c.name],
                ['category', c.category],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} id={`invite-${key}`} label={label}>
                <Input
                  id={`invite-${key}`}
                  name={key}
                  required
                  type={key === 'email' ? 'email' : 'text'}
                  maxLength={120}
                />
              </Field>
            ))}
            <Button type="submit" disabled={pending}>
              {c.invite}
            </Button>
          </form>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  const data = await apiRequest<PageResult<Caregiver>>('/agency/caregivers');
                  setRows(data.items);
                  setCursor(data.nextCursor);
                } catch (e) {
                  setMessage(peopleError(c, e));
                }
              })
            }
          >
            {c.refresh}
          </Button>
        </>
      ) : null}
      {message ? (
        <Feedback tone={message === c.saved ? 'success' : 'error'} title={message} />
      ) : null}
      {loading ? <Feedback title={c.loading} /> : null}
      {!own && !loading && !rows.length ? <Feedback title={c.empty} /> : null}
      {rows.map((row) => (
        <article className="raak-card" key={row.id}>
          <h2>{row.name}</h2>
          <p>{stateLabel(c, row.operationalStatus)}</p>
          <Button variant="secondary" disabled={pending} onClick={() => inspect(row.id)}>
            {c.detail}
          </Button>
        </article>
      ))}
      {cursor ? (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                const data = await apiRequest<PageResult<Caregiver>>(
                  `/agency/caregivers?cursor=${cursor}`,
                );
                setRows(data.items);
                setCursor(data.nextCursor);
              } catch (e) {
                setMessage(peopleError(c, e));
              }
            })
          }
        >
          {c.next}
        </Button>
      ) : null}
      {selected ? (
        <CaregiverProfile
          key={`${selected.id}-${selected.version}-${selected.qualifications.map((q) => `${q.id}:${q.version}`).join(',')}`}
          locale={locale}
          caregiver={selected}
          readOnly={own}
          onSaved={async () => {
            setSelected(await apiRequest<Caregiver>(`/agency/caregivers/${selected.id}`));
            setMessage(c.saved);
          }}
        />
      ) : null}
    </div>
  );
  return own ? (
    <PortalFrame locale={locale} path="/caregiver/profile">
      {content}
    </PortalFrame>
  ) : (
    content
  );
}
