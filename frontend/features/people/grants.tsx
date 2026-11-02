'use client';
import { useEffect, useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { apiRequest } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import { CheckboxField, Field, Input } from '../../components/ui/field';
import { Select } from '../../components/ui/select';
import { Feedback } from '../../components/ui/feedback';
import { peopleCopy, peopleError, stateLabel } from './copy';
import type { Grant } from './contracts';
import { formatPeopleInstant } from './dates';

export function PatientGrants({ locale, patientId }: { locale: Locale; patientId: string }) {
  const c = peopleCopy(locale);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [timezone, setTimezone] = useState('UTC');
  const [email, setEmail] = useState('');
  const [method, setMethod] = useState('PATIENT_CONSENT');
  const [scopes, setScopes] = useState<string[]>(['VIEW_BASIC']);
  const [expiry, setExpiry] = useState('');
  const [evidence, setEvidence] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  async function load() {
    const result = await apiRequest<{ items: Grant[]; timezone: string }>(
      `/agency/patients/${patientId}/access-grants`,
    );
    setGrants(result.items);
    setTimezone(result.timezone);
  }
  useEffect(() => {
    let active = true;
    apiRequest<{ items: Grant[]; timezone: string }>(`/agency/patients/${patientId}/access-grants`)
      .then((result) => {
        if (active) {
          setGrants(result.items);
          setTimezone(result.timezone);
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setFailed(true);
          setMessage(peopleError(c, e));
        }
      });
    return () => {
      active = false;
    };
  }, [patientId, c]);
  function perform(operation: () => Promise<void>) {
    start(async () => {
      setMessage('');
      try {
        await operation();
        await load();
        setFailed(false);
        setMessage(c.saved);
      } catch (e) {
        setFailed(true);
        setMessage(peopleError(c, e));
      }
    });
  }
  return (
    <section className="raak-card">
      <h2>{c.grants}</h2>
      <p>
        <bdi>{timezone}</bdi>
      </p>
      <p>{c.grantHelp}</p>
      {message ? <Feedback tone={failed ? 'error' : 'success'} title={message} /> : null}
      <form
        className="raak-form"
        onSubmit={(event) => {
          event.preventDefault();
          perform(async () => {
            const customer = await apiRequest<{ id: string }>('/agency/customers/lookup', {
              method: 'POST',
              body: JSON.stringify({ email }),
            });
            await apiRequest(`/agency/patients/${patientId}/access-grants`, {
              method: 'POST',
              body: JSON.stringify({
                customerAccountId: customer.id,
                scopes,
                authorizationType: method,
                ...(expiry ? { expiresAt: new Date(`${expiry}Z`).toISOString() } : {}),
                ...(evidence ? { evidenceDocumentId: evidence } : {}),
              }),
            });
          });
        }}
      >
        <Field id="grant-email" label={c.customerEmail}>
          <Input
            id="grant-email"
            name="customerEmail"
            spellCheck={false}
            type="email"
            required
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field id="grant-method" label={c.authorizationType}>
          <Select
            id="grant-method"
            name="authorizationType"
            label={c.authorizationType}
            value={method}
            onValueChange={setMethod}
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
            options={Object.entries(c.methods).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        {Object.entries(c.scopes).map(([scope, label]) => (
          <CheckboxField
            key={scope}
            id={`scope-${scope}`}
            label={label}
            checked={scopes.includes(scope)}
            onChange={(e) =>
              setScopes((s) => (e.target.checked ? [...s, scope] : s.filter((v) => v !== scope)))
            }
          />
        ))}
        <Field id="grant-expiry" label={c.expiresAt}>
          <Input
            id="grant-expiry"
            type="datetime-local"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
        </Field>
        <Field id="grant-evidence" label={c.evidence}>
          <Input
            id="grant-evidence"
            dir="ltr"
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={pending || scopes.length === 0}>
          {c.issueGrant}
        </Button>
      </form>
      {!grants.length ? (
        <Feedback title={c.empty} />
      ) : (
        grants.map((grant) => (
          <article className="raak-card" key={grant.id}>
            <bdi>{grant.customerAccountId}</bdi>
            <p>
              {stateLabel(c, grant.effectiveStatus)} ·{' '}
              {grant.scopes.map((s) => c.scopes[s as keyof typeof c.scopes]).join(' · ')}
            </p>
            <p>
              <time dateTime={grant.verifiedAt}>
                {formatPeopleInstant(grant.verifiedAt, locale, timezone)}
              </time>
              {grant.expiresAt ? (
                <>
                  {' '}
                  —{' '}
                  <time dateTime={grant.expiresAt}>
                    {formatPeopleInstant(grant.expiresAt, locale, timezone)}
                  </time>
                </>
              ) : null}
            </p>
            {!grant.revokedAt ? (
              <form
                className="raak-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  perform(async () => {
                    await apiRequest(`/agency/patient-access/${grant.id}/revoke`, {
                      method: 'POST',
                      body: JSON.stringify({ reason: reasons[grant.id] }),
                    });
                  });
                }}
              >
                <Field id={`revoke-${grant.id}`} label={c.revokeReason}>
                  <Input
                    id={`revoke-${grant.id}`}
                    required
                    minLength={5}
                    maxLength={300}
                    value={reasons[grant.id] ?? ''}
                    onChange={(e) => setReasons((r) => ({ ...r, [grant.id]: e.target.value }))}
                  />
                </Field>
                <Button type="submit" variant="secondary" disabled={pending}>
                  {c.revoke}
                </Button>
              </form>
            ) : null}
          </article>
        ))
      )}
    </section>
  );
}
