'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import type { Locale } from '../../lib/i18n';
import { apiRequest } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import { Input, Field, Textarea, CheckboxField } from '../../components/ui/field';
import { Select } from '../../components/ui/select';
import { Stepper } from '../../components/ui/stepper';
import { Feedback } from '../../components/ui/feedback';
import { CatalogFrame } from './frame';
import { catalogCopy, localized } from './copy';
import type { Portal, Service } from './contracts';
import { Price } from './portal';
import { invalidIntakeFields } from './intake-validation';

export function GuestIntake({ locale, slug }: { locale: Locale; slug?: string }) {
  const c = catalogCopy(locale);
  const [portal, setPortal] = useState<Portal | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [serviceId, setServiceId] = useState('');
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string; reference: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({
    requesterName: '',
    requesterEmail: '',
    requesterPhone: '',
    beneficiaryName: '',
    relationship: 'SELF',
    areaId: '',
    preferredDate: '',
    preferredPeriod: 'FLEXIBLE',
    notes: '',
    privacyAccepted: false,
    priceAcknowledged: false,
    website: '',
  });
  const key = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest<Portal>('/portal/services'),
      slug
        ? apiRequest<Service>(`/portal/services/${encodeURIComponent(slug)}`)
        : Promise.resolve(null),
    ])
      .then(([d, selected]) => {
        if (active) {
          const services =
            selected && !d.services.some((s) => s.id === selected.id)
              ? [...d.services, selected]
              : d.services;
          setPortal({ ...d, services });
          setServiceId(selected?.id ?? services[0]?.id ?? '');
        }
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, [slug]);
  const service = portal?.services.find((s) => s.id === serviceId);
  const brand = portal?.agency.brandJson;
  function update(name: keyof typeof draft, value: string | boolean) {
    setDraft((d) => ({ ...d, [name]: value }));
    key.current = null;
  }
  function go(next: number) {
    setStep(next);
    setErrors([]);
    setFailed(false);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function submit() {
    if (!service) return;
    const fields = invalidIntakeFields(step, draft, service.config.pricingType === 'FIXED');
    if (fields.length) {
      setErrors(fields);
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    if (step < 3) {
      go(step + 1);
      return;
    }
    if (!key.current) key.current = crypto.randomUUID();
    startTransition(async () => {
      try {
        setFailed(false);
        const result = await apiRequest<{ id: string; reference: string }>('/portal/requests', {
          method: 'POST',
          headers: { 'Idempotency-Key': key.current! },
          body: JSON.stringify({
            ...draft,
            locale,
            serviceId: service.id,
            serviceVersion: service.version,
            privacyVersion: '2026-11-01',
          }),
        });
        setReceipt(result);
        setDraft((d) => ({
          ...d,
          requesterName: '',
          requesterEmail: '',
          requesterPhone: '',
          beneficiaryName: '',
          notes: '',
        }));
      } catch {
        setFailed(true);
      }
    });
  }
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const field = (
    name:
      'requesterName' | 'requesterEmail' | 'requesterPhone' | 'beneficiaryName' | 'preferredDate',
  ) => (
    <Field
      key={name}
      id={name}
      label={c[name]}
      error={errors.includes(name) ? c.required : undefined}
    >
      <Input
        id={name}
        name={name}
        type={name === 'requesterEmail' ? 'email' : name === 'preferredDate' ? 'date' : 'text'}
        dir={
          ['requesterEmail', 'requesterPhone', 'preferredDate'].includes(name) ? 'ltr' : undefined
        }
        value={draft[name]}
        maxLength={name === 'requesterPhone' ? 30 : name === 'requesterEmail' ? 254 : 120}
        required={name !== 'requesterPhone'}
        aria-invalid={errors.includes(name)}
        aria-describedby={errors.includes(name) ? `${name}-error` : undefined}
        onChange={(e) => update(name, e.target.value)}
      />
    </Field>
  );
  const select = (
    name: 'relationship' | 'areaId' | 'preferredPeriod',
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <Field id={name} label={label} error={errors.includes(name) ? c.required : undefined}>
      <Select
        id={name}
        name={name}
        label={label}
        dir={dir}
        value={draft[name]}
        options={options}
        invalid={errors.includes(name)}
        describedBy={errors.includes(name) ? `${name}-error` : undefined}
        onValueChange={(v) => update(name, v)}
      />
    </Field>
  );
  return (
    <CatalogFrame
      locale={locale}
      name={brand ? localized(brand, locale) : portal?.agency.displayName}
      branding={brand}
      path="/request"
    >
      {unavailable ? (
        <Feedback title={c.unavailable} tone="error" />
      ) : !portal ? (
        <Feedback title={c.loading} />
      ) : receipt ? (
        <section className="raak-card">
          <h1>{c.received}</h1>
          <p>{c.receipt}</p>
          <p>
            {c.reference}: <bdi data-testid="receipt-reference">{receipt.reference}</bdi>
          </p>
          <p>{c.notConfirmed}</p>
          <Link href={`/${locale}/track`}>{c.track}</Link>
        </section>
      ) : (
        <>
          <h1 ref={heading} tabIndex={-1}>
            {c.steps[step]}
          </h1>
          <Stepper steps={c.steps} current={step} label={c.request} />
          <p>{c.notConfirmed}</p>
          {failed ? <Feedback title={c.error} tone="error" /> : null}
          {errors.length ? <Feedback title={c.required} tone="error" /> : null}
          <form
            ref={form}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="raak-form"
          >
            {step === 0 ? (
              <>
                <Field id="service" label={c.services}>
                  <Select
                    id="service"
                    name="service"
                    label={c.services}
                    dir={dir}
                    value={serviceId}
                    options={portal.services.map((s) => ({
                      value: s.id,
                      label: localized(s.config, locale),
                    }))}
                    onValueChange={(v) => {
                      setServiceId(v);
                      update('priceAcknowledged', false);
                    }}
                  />
                </Field>
                {service ? (
                  <section className="raak-card">
                    <h2>{localized(service.config, locale)}</h2>
                    <p>
                      {locale === 'ar'
                        ? service.config.descriptionAr
                        : service.config.descriptionEn}
                    </p>
                    <Price service={service} currency={portal.agency.currency} locale={locale} />
                  </section>
                ) : (
                  <Feedback title={c.empty} />
                )}
              </>
            ) : null}
            {step === 1 ? (
              <>
                {field('requesterName')}
                {field('requesterEmail')}
                {field('requesterPhone')}
                {field('beneficiaryName')}
                {select(
                  'relationship',
                  c.relationship,
                  (['SELF', 'FAMILY', 'OTHER'] as const).map((v) => ({ value: v, label: c[v] })),
                )}
              </>
            ) : null}
            {step === 2 ? (
              <>
                {select(
                  'areaId',
                  c.area,
                  (
                    brand?.areas ??
                    service?.config.serviceAreaIds.map((id) => ({ id, nameAr: id, nameEn: id })) ??
                    []
                  )
                    .filter((a) => service?.config.serviceAreaIds.includes(a.id))
                    .map((a) => ({ value: a.id, label: localized(a, locale) })),
                )}
                {field('preferredDate')}
                {select(
                  'preferredPeriod',
                  c.preferredPeriod,
                  (['MORNING', 'AFTERNOON', 'EVENING', 'FLEXIBLE'] as const).map((v) => ({
                    value: v,
                    label: c[v],
                  })),
                )}
                <Field id="notes" label={c.notes}>
                  <Textarea
                    id="notes"
                    value={draft.notes}
                    maxLength={500}
                    rows={3}
                    onChange={(e) => update('notes', e.target.value)}
                  />
                </Field>
              </>
            ) : null}
            {step === 3 && service ? (
              <>
                <section className="raak-card">
                  <h2>{localized(service.config, locale)}</h2>
                  <Price service={service} currency={portal.agency.currency} locale={locale} />
                  <p>
                    {draft.requesterName} · <bdi dir="ltr">{draft.requesterEmail}</bdi>
                  </p>
                  <p>{draft.beneficiaryName}</p>
                  <p>
                    <bdi>{draft.preferredDate}</bdi> · {c[draft.preferredPeriod as 'FLEXIBLE']}
                  </p>
                </section>
                <h2>{c.privacyTitle}</h2>
                <p>{c.privacyText}</p>
                <CheckboxField
                  id="privacyAccepted"
                  label={c.privacy}
                  checked={draft.privacyAccepted}
                  onChange={(e) => update('privacyAccepted', e.target.checked)}
                  error={errors.includes('privacyAccepted') ? c.required : undefined}
                />
                {service.config.pricingType === 'FIXED' ? (
                  <CheckboxField
                    id="priceAcknowledged"
                    label={c.priceConsent}
                    checked={draft.priceAcknowledged}
                    onChange={(e) => update('priceAcknowledged', e.target.checked)}
                    error={errors.includes('priceAcknowledged') ? c.required : undefined}
                  />
                ) : null}
              </>
            ) : null}
            <div className="raak-honeypot" aria-hidden="true">
              <label htmlFor="website">{c.website}</label>
              <input
                id="website"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={draft.website}
                onChange={(e) => update('website', e.target.value)}
              />
            </div>
            <div className="raak-actions">
              {step > 0 ? (
                <Button variant="secondary" disabled={pending} onClick={() => go(step - 1)}>
                  {c.back}
                </Button>
              ) : null}
              <Button type="submit" disabled={!service || pending} aria-busy={pending}>
                {pending ? c.loading : step === 3 ? c.submit : c.next}
              </Button>
            </div>
          </form>
        </>
      )}
    </CatalogFrame>
  );
}
