'use client';
import { useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { apiRequest } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import { CheckboxField, Field, Input } from '../../components/ui/field';
import { Select } from '../../components/ui/select';
import { Feedback } from '../../components/ui/feedback';
import { peopleCopy, peopleError, stateLabel } from './copy';
import type { Caregiver } from './contracts';
import { CaregiverAvailability } from './availability';
import { PrivateFiles } from './documents';
import { useAgencyOfferings, type AgencyOffering } from './service-options';
import { formatPeopleLocalDate } from './dates';

export function CaregiverProfile({
  locale,
  caregiver,
  readOnly = false,
  onSaved,
}: {
  locale: Locale;
  caregiver: Caregiver;
  readOnly?: boolean;
  onSaved(): Promise<void>;
}) {
  const c = peopleCopy(locale);
  const [name, setName] = useState(caregiver.name);
  const [category, setCategory] = useState(caregiver.professionalCategory);
  const [status, setStatus] = useState(caregiver.operationalStatus);
  const [areas, setAreas] = useState(caregiver.serviceAreasJson.join(','));
  const [serviceIds, setServiceIds] = useState(
    caregiver.serviceAuthorizations.map((s) => s.agencyServiceId),
  );
  const offerings = useAgencyOfferings(!readOnly, locale);
  const [message, setMessage] = useState('');
  const [qualificationReasons, setQualificationReasons] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  function perform(path: string, body: object, method = 'POST') {
    start(async () => {
      try {
        await apiRequest(path, { method, body: JSON.stringify(body) });
        setMessage('');
        await onSaved();
      } catch (e) {
        setMessage(peopleError(c, e));
      }
    });
  }
  return (
    <section
      data-caregiver-id={caregiver.id}
      data-caregiver-version={caregiver.version}
      data-availability-revision={caregiver.availabilityRevision}
    >
      <h2>{caregiver.name}</h2>
      {message ? <Feedback tone="error" title={message} /> : null}
      {!readOnly ? (
        <form
          className="raak-card raak-form"
          onSubmit={(event) => {
            event.preventDefault();
            perform(
              `/agency/caregivers/${caregiver.id}`,
              {
                expectedVersion: caregiver.version,
                name,
                professionalCategory: category,
                operationalStatus: status,
                serviceAreas: areas
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
              'PATCH',
            );
          }}
        >
          <Field id="caregiver-name" label={c.name}>
            <Input
              id="caregiver-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field id="caregiver-category" label={c.category}>
            <Input
              id="caregiver-category"
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </Field>
          <Field id="caregiver-status" label={c.status}>
            <Select
              id="caregiver-status"
              name="status"
              label={c.status}
              value={status}
              onValueChange={setStatus}
              dir={locale === 'ar' ? 'rtl' : 'ltr'}
              options={['ACTIVE', 'INACTIVE'].map((value) => ({
                value,
                label: stateLabel(c, value),
              }))}
            />
          </Field>
          <Field id="caregiver-areas" label={c.areas}>
            <Input
              id="caregiver-areas"
              value={areas}
              onChange={(e) => setAreas(e.target.value)}
              dir="ltr"
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {c.save}
          </Button>
        </form>
      ) : (
        <p>
          {caregiver.professionalCategory} · {stateLabel(c, caregiver.operationalStatus)}
        </p>
      )}
      <section className="raak-card">
        <h2>{c.qualifications}</h2>
        {!caregiver.qualifications.length ? (
          <Feedback title={c.empty} />
        ) : (
          caregiver.qualifications.map((q) => (
            <article className="raak-card" key={q.id}>
              <bdi>{q.code}</bdi>
              <p>
                {stateLabel(c, q.effectiveStatus)}
                {q.validThrough ? (
                  <>
                    {' '}
                    ·{' '}
                    <time dateTime={q.validThrough}>
                      {formatPeopleLocalDate(q.validThrough, locale)}
                    </time>
                  </>
                ) : null}
              </p>
              {!readOnly && ['PENDING', 'VERIFIED'].includes(q.status) ? (
                <div className="raak-actions">
                  {q.status === 'PENDING' ? (
                    <Button
                      disabled={pending}
                      onClick={() =>
                        perform(`/agency/qualifications/${q.id}/verify`, {
                          expectedVersion: q.version,
                          decision: 'VERIFIED',
                        })
                      }
                    >
                      {c.verifyQualification}
                    </Button>
                  ) : null}
                  <Field id={`qualification-reason-${q.id}`} label={c.reason}>
                    <Input
                      id={`qualification-reason-${q.id}`}
                      maxLength={300}
                      value={qualificationReasons[q.id] ?? ''}
                      onChange={(e) =>
                        setQualificationReasons((r) => ({ ...r, [q.id]: e.target.value }))
                      }
                    />
                  </Field>
                  <Button
                    variant="secondary"
                    disabled={pending || (qualificationReasons[q.id]?.trim().length ?? 0) < 5}
                    onClick={() =>
                      perform(`/agency/qualifications/${q.id}/verify`, {
                        expectedVersion: q.version,
                        decision: 'REJECTED',
                        reason: qualificationReasons[q.id],
                      })
                    }
                  >
                    {c.rejectQualification}
                  </Button>
                </div>
              ) : null}
            </article>
          ))
        )}
        {!readOnly ? (
          <form
            className="raak-form"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              perform(`/agency/caregivers/${caregiver.id}/qualifications`, {
                code: data.get('code'),
                licenseIssuer: data.get('issuer'),
                licenseNumberRestricted: data.get('license'),
                validThrough: data.get('validThrough') || null,
                ...(data.get('documentId') ? { documentId: data.get('documentId') } : {}),
              });
            }}
          >
            {(
              [
                ['code', c.qualificationCode],
                ['issuer', c.issuer],
                ['license', c.licenseNumber],
                ['validThrough', c.validThrough],
                ['documentId', c.supportingDocument],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} id={`q-${key}`} label={label}>
                <Input
                  id={`q-${key}`}
                  name={key}
                  required={!['validThrough', 'documentId'].includes(key)}
                  type={key === 'validThrough' ? 'date' : 'text'}
                  maxLength={120}
                  dir="ltr"
                />
              </Field>
            ))}
            <Button type="submit" disabled={pending}>
              {c.addQualification}
            </Button>
          </form>
        ) : null}
      </section>
      {!readOnly ? (
        <form
          id="caregiver-services"
          className="raak-card raak-form"
          onSubmit={(e) => {
            e.preventDefault();
            perform(
              `/agency/caregivers/${caregiver.id}/service-authorizations`,
              { expectedVersion: caregiver.version, serviceIds },
              'PUT',
            );
          }}
        >
          <h2>{c.services}</h2>
          {offerings.error ? <Feedback tone="error" title={offerings.error} /> : null}
          {!offerings.items.length ? (
            <Feedback title={c.empty} />
          ) : (
            offerings.items.map((offering) => (
              <CheckboxField
                key={offering.id}
                id={`service-${offering.id}`}
                label={locale === 'ar' ? offering.config.nameAr : offering.config.nameEn}
                checked={serviceIds.includes(offering.id)}
                disabled={
                  pending || (!serviceIds.includes(offering.id) && serviceIds.length >= 100)
                }
                onChange={(e) =>
                  setServiceIds((ids) =>
                    e.target.checked
                      ? [...ids, offering.id]
                      : ids.filter((id) => id !== offering.id),
                  )
                }
              />
            ))
          )}
          {offerings.cursor ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => start(offerings.loadNext)}
            >
              {c.next}
            </Button>
          ) : null}
          <Button type="submit" disabled={pending}>
            {c.save}
          </Button>
        </form>
      ) : null}
      <CaregiverAvailability
        key={`availability-${caregiver.availabilityRevision}`}
        locale={locale}
        caregiver={caregiver}
        readOnly={readOnly}
        onSaved={onSaved}
      />
      {!readOnly ? (
        <>
          <EligibilityForm locale={locale} caregiverId={caregiver.id} offerings={offerings.items} />
          <PrivateFiles locale={locale} parentId={caregiver.id} parentType="CAREGIVER" />
        </>
      ) : null}
    </section>
  );
}

function EligibilityForm({
  locale,
  caregiverId,
  offerings,
}: {
  locale: Locale;
  caregiverId: string;
  offerings: AgencyOffering[];
}) {
  const c = peopleCopy(locale);
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const [serviceId, setServiceId] = useState('');
  return (
    <form
      className="raak-card raak-form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        start(async () => {
          try {
            const result = await apiRequest<{ foundationEligible: boolean }>(
              `/agency/caregivers/${caregiverId}/eligibility`,
              {
                method: 'POST',
                body: JSON.stringify({
                  serviceId,
                  localDate: data.get('date'),
                  startLocal: data.get('start'),
                  endLocal: data.get('end'),
                }),
              },
            );
            setMessage(result.foundationEligible ? c.eligible : c.ineligible);
          } catch (e) {
            setMessage(peopleError(c, e));
          }
        });
      }}
    >
      <h2>{c.eligibility}</h2>
      <p>{c.eligibilityHelp}</p>
      {message ? <Feedback title={message} /> : null}
      <Field id="eligibility-serviceId" label={c.serviceId}>
        <Select
          id="eligibility-serviceId"
          name="serviceId"
          label={c.serviceId}
          value={serviceId}
          onValueChange={setServiceId}
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
          options={offerings.map((offering) => ({
            value: offering.id,
            label: locale === 'ar' ? offering.config.nameAr : offering.config.nameEn,
          }))}
        />
      </Field>
      {(
        [
          ['date', c.date, 'date'],
          ['start', c.start, 'time'],
          ['end', c.end, 'time'],
        ] as const
      ).map(([key, label, type]) => (
        <Field key={key} id={`eligibility-${key}`} label={label}>
          <Input id={`eligibility-${key}`} name={key} type={type} required dir="ltr" />
        </Field>
      ))}
      <Button type="submit" disabled={pending || !serviceId}>
        {c.eligibility}
      </Button>
    </form>
  );
}
