'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Locale } from '../../lib/i18n';
import { apiRequest } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import { Feedback } from '../../components/ui/feedback';
import { PortalFrame } from '../../components/layout/portal-frame';
import { catalogCopy, localized } from './copy';
import type { Portal, Service } from './contracts';

export function Price({
  service,
  currency,
  locale,
}: {
  service: Service;
  currency: string;
  locale: Locale;
}) {
  const c = catalogCopy(locale);
  const s = service.config;
  const digits =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  return (
    <p>
      {c[s.pricingType]}{' '}
      {s.priceMinor !== null ? (
        <>
          <bdi>
            {new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
              s.priceMinor / 10 ** digits,
            )}
          </bdi>{' '}
          {s.pricingUnit ? c[s.pricingUnit] : ''}
        </>
      ) : null}
    </p>
  );
}
export function CatalogPortal({ locale, slug }: { locale: Locale; slug?: string }) {
  const c = catalogCopy(locale);
  const [data, setData] = useState<Portal | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest<Portal>('/portal/services'),
      slug
        ? apiRequest<Service>(`/portal/services/${encodeURIComponent(slug)}`)
        : Promise.resolve(null),
    ])
      .then(([d, detail]) => {
        if (active) setData(detail ? { ...d, services: [detail], nextCursor: null } : d);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [slug]);
  const brand = data?.agency.brandJson;
  const services = data?.services.filter((s) => !slug || s.slug === slug) ?? [];
  return (
    <PortalFrame
      locale={locale}
      name={brand ? localized(brand, locale) : data?.agency.displayName}
      branding={brand}
      path={slug ? `/services/${slug}` : '/services'}
    >
      {error ? (
        <Feedback title={c.unavailable} tone="error" />
      ) : !data ? (
        <Feedback title={c.loading} />
      ) : (
        <>
          <div className="rv-page-heading">
            <div>
              <h1>{slug && services[0] ? localized(services[0].config, locale) : c.services}</h1>
              <p>{brand ? (locale === 'ar' ? brand.descriptionAr : brand.descriptionEn) : ''}</p>
            </div>
          </div>
          {services.length === 0 ? (
            <Feedback title={c.empty} />
          ) : (
            services.map((s) => (
              <article className="raak-card" key={s.id}>
                {!slug ? (
                  <h2>
                    <Link href={`/${locale}/services/${s.slug}`}>
                      {localized(s.config, locale)}
                    </Link>
                  </h2>
                ) : null}
                <p>
                  {slug
                    ? locale === 'ar'
                      ? s.config.descriptionAr
                      : s.config.descriptionEn
                    : locale === 'ar'
                      ? s.config.summaryAr
                      : s.config.summaryEn}
                </p>
                <p>
                  {c.duration}: <bdi>{s.config.durationMin}</bdi>
                </p>
                <Price service={s} currency={data.agency.currency} locale={locale} />
                <Button asChild>
                  <Link href={`/${locale}/request?service=${s.slug}`}>{c.request}</Link>
                </Button>
              </article>
            ))
          )}
          {data.nextCursor && !slug ? (
            <Button
              variant="secondary"
              onClick={() => {
                void apiRequest<Portal>(`/portal/services?cursor=${data.nextCursor}`)
                  .then((next) =>
                    setData({ ...next, services: [...data.services, ...next.services] }),
                  )
                  .catch(() => setError(true));
              }}
            >
              {c.next}
            </Button>
          ) : null}
          <p>{c.notConfirmed}</p>
        </>
      )}
    </PortalFrame>
  );
}
