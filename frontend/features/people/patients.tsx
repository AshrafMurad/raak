'use client';
import { useEffect, useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { apiRequest } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import { Field, Input } from '../../components/ui/field';
import { Feedback } from '../../components/ui/feedback';
import { PortalFrame } from '../../components/layout/portal-frame';
import { peopleCopy, peopleError, stateLabel } from './copy';
import type { PageResult, Patient, PatientSummary } from './contracts';
import { PatientEditor } from './patient-editor';
import { PatientGrants } from './grants';
import { PrivateFiles } from './documents';
import './people.css';

export function Patients({
  locale,
  portal = false,
  requestId,
}: {
  locale: Locale;
  portal?: boolean;
  requestId?: string;
}) {
  const c = peopleCopy(locale);
  const [rows, setRows] = useState<PatientSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Patient | PatientSummary | null>(null);
  const [approved, setApproved] = useState<{
    id: string;
    version: number;
    beneficiaryName: string;
    areaId: string;
  }>();
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();
  const endpoint = portal ? '/portal/my/patients' : '/agency/patients';
  async function load(next?: string) {
    const data = await apiRequest<PageResult<PatientSummary>>(
      `${endpoint}${next ? `?cursor=${next}` : ''}`,
    );
    setRows(data.items);
    setCursor(data.nextCursor);
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<PageResult<PatientSummary>>(endpoint),
      requestId
        ? apiRequest<{
            id: string;
            version: number;
            beneficiaryName: string;
            areaId: string;
            status: string;
          }>(`/agency/requests/${requestId}`)
        : Promise.resolve(null),
    ])
      .then(([data, req]) => {
        if (active) {
          setRows(data.items);
          setCursor(data.nextCursor);
          if (req?.status === 'APPROVED') setApproved(req);
        }
      })
      .catch((e: unknown) => {
        if (active) setMessage(peopleError(c, e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint, requestId, c]);
  const content = (
    <div className="raak-people">
      <h1>{portal ? c.authorizedPatients : c.patients}</h1>
      {message ? (
        <Feedback tone={message === c.saved ? 'success' : 'error'} title={message} />
      ) : null}
      {loading ? <Feedback title={c.loading} /> : null}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              await load();
              setMessage('');
            } catch (e) {
              setMessage(peopleError(c, e));
            }
          })
        }
      >
        {c.refresh}
      </Button>
      {!portal && selected ? (
        <Button variant="secondary" onClick={() => setSelected(null)}>
          {c.newPatient}
        </Button>
      ) : null}
      {approved ? (
        <Field id="patient-link-reason" label={c.linkReason}>
          <Input
            id="patient-link-reason"
            minLength={5}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      ) : null}
      {!loading && !rows.length ? (
        <Feedback title={c.empty} />
      ) : (
        rows.map((patient) => (
          <article className="raak-card" key={patient.id}>
            <h2>{patient.displayName}</h2>
            <p>{stateLabel(c, patient.status)}</p>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    setSelected(null);
                    setSelected(
                      await apiRequest<Patient | PatientSummary>(`${endpoint}/${patient.id}`),
                    );
                    setMessage('');
                  } catch (e) {
                    setSelected(null);
                    setMessage(peopleError(c, e));
                  }
                })
              }
            >
              {c.detail}
            </Button>
            {approved ? (
              <Button
                variant="secondary"
                disabled={pending || reason.trim().length < 5}
                onClick={() =>
                  start(async () => {
                    try {
                      await apiRequest(`/agency/requests/${approved.id}/link-patient`, {
                        method: 'POST',
                        body: JSON.stringify({
                          patientId: patient.id,
                          expectedVersion: approved.version,
                          reason,
                        }),
                      });
                      setApproved(undefined);
                      setMessage('');
                      await load();
                    } catch (e) {
                      setMessage(peopleError(c, e));
                    }
                  })
                }
              >
                {c.linkPatient}
              </Button>
            ) : null}
          </article>
        ))
      )}
      {cursor ? (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                await load(cursor);
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
        <section aria-label={c.detail}>
          <h2>{selected.displayName}</h2>
          {!portal && 'version' in selected ? (
            <>
              <PatientEditor
                key={`${selected.id}-${selected.version}`}
                locale={locale}
                patient={selected}
                onSaved={() => {
                  setSelected(null);
                  setMessage(c.saved);
                  void load().catch((e: unknown) => setMessage(peopleError(c, e)));
                }}
              />
              <PatientGrants key={selected.id} locale={locale} patientId={selected.id} />
            </>
          ) : null}
          <PrivateFiles
            key={selected.id}
            locale={locale}
            parentId={selected.id}
            parentType="PATIENT"
            readOnly={portal}
          />
        </section>
      ) : null}
      {!portal && !selected && !loading && (!requestId || approved) ? (
        <PatientEditor
          key={approved?.id ?? 'manual'}
          locale={locale}
          request={approved}
          onSaved={() => {
            setApproved(undefined);
            setMessage(c.saved);
            void load().catch((e: unknown) => setMessage(peopleError(c, e)));
          }}
        />
      ) : null}
    </div>
  );
  return portal ? (
    <PortalFrame locale={locale} path="/my/patients">
      {content}
    </PortalFrame>
  ) : (
    content
  );
}
