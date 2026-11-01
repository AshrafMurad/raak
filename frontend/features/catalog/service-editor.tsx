'use client';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { apiRequest } from '../../lib/api-client';
import { Input, Field, Textarea, CheckboxField } from '../../components/ui/field';
import { Button } from '../../components/ui/button';
import { Select } from '../../components/ui/select';
import { Feedback } from '../../components/ui/feedback';
import { StatusBadge } from '../../components/ui/status-badge';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '../../components/ui/dialog';
import { CatalogFrame } from './frame';
import { WorkspaceNav } from './workspace-nav';
import { catalogCopy, localized } from './copy';
import type { Service, ServiceConfig } from './contracts';

const emptyConfig: ServiceConfig = {
  nameAr: '',
  nameEn: '',
  summaryAr: '',
  summaryEn: '',
  descriptionAr: '',
  descriptionEn: '',
  durationMin: 60,
  clinicalClass: 'NON_CLINICAL',
  requiredQualificationCodes: [],
  serviceAreaIds: [],
  allowStandalone: true,
  allowRecurring: false,
  pricingType: 'CUSTOM_QUOTE',
  priceMinor: null,
  pricingUnit: null,
};
export function ServiceEditor({ locale }: { locale: Locale }) {
  const [publication, setPublication] = useState<Service | null>(null);
  const publicationOpener = useRef<HTMLButtonElement | null>(null);
  const c = catalogCopy(locale);
  const [services, setServices] = useState<Service[]>([]);
  const [templates, setTemplates] = useState<{ id: string; code: string; config: ServiceConfig }[]>(
    [],
  );
  const [selected, setSelected] = useState<Service | null>(null);
  const [config, setConfig] = useState<ServiceConfig>({ ...emptyConfig });
  const [slug, setSlug] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const [serviceCursor, setServiceCursor] = useState<string | null>(null);
  const [templateCursor, setTemplateCursor] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [rows, t] = await Promise.all([
      apiRequest<{ items: Service[]; nextCursor: string | null }>('/agency/services'),
      apiRequest<{
        items: { id: string; code: string; config: ServiceConfig }[];
        nextCursor: string | null;
      }>('/catalog/platform-templates'),
    ]);
    setServices(rows.items);
    setTemplates(t.items);
    setServiceCursor(rows.nextCursor);
    setTemplateCursor(t.nextCursor);
  }, []);
  useEffect(() => {
    void load().catch(() => setMessage(c.error));
  }, [c.error, load]);
  function action(run: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await run();
        await load();
        setMessage(c.saved);
      } catch {
        setMessage(c.error);
      }
    });
  }
  function pick(s: Service | null) {
    setSelected(s);
    setConfig(s?.config ?? { ...emptyConfig });
    setSlug(s?.slug ?? '');
    setEnabled(s?.isEnabled ?? true);
  }
  const select = (field: 'pricingType' | 'pricingUnit' | 'clinicalClass', options: string[]) => (
    <Field id={field} label={c[field]}>
      <Select
        id={field}
        name={field}
        label={c[field]}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
        value={config[field] ?? ''}
        options={options.map((v) => ({ value: v, label: c[v as 'FIXED'] }))}
        onValueChange={(v) =>
          setConfig((old) => ({
            ...old,
            [field]: v,
            ...(field === 'pricingType'
              ? {
                  priceMinor: v === 'CUSTOM_QUOTE' ? null : 0,
                  pricingUnit: v === 'CUSTOM_QUOTE' ? null : ('VISIT' as const),
                }
              : {}),
          }))
        }
      />
    </Field>
  );
  return (
    <CatalogFrame locale={locale} path="/workspace/services">
      <WorkspaceNav locale={locale} />
      <h1>{c.services}</h1>
      {message ? <Feedback title={message} /> : null}
      <section className="raak-card">
        <h2>{c.templates}</h2>
        {templates.map((t) => (
          <div className="raak-actions" key={t.id}>
            <span>{localized(t.config, locale)}</span>
            <Button
              variant="secondary"
              disabled={pending || !slug}
              onClick={() =>
                action(() =>
                  apiRequest('/agency/services', {
                    method: 'POST',
                    body: JSON.stringify({ templateId: t.id, slug }),
                  }),
                )
              }
            >
              {c.import}
            </Button>
          </div>
        ))}
      </section>
      <section className="raak-card">
        <Button variant="secondary" onClick={() => pick(null)}>
          {c.create}
        </Button>
        {services.map((s) => (
          <div className="raak-actions" key={s.id}>
            <span>{localized(s.config, locale)}</span>
            <StatusBadge tone={s.isPublished ? 'scheduled' : 'planned'}>
              {s.isPublished ? c.published : c.draft}
            </StatusBadge>
            <Button variant="ghost" onClick={() => pick(s)}>
              {c.edit}
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={(event) => {
                publicationOpener.current = event.currentTarget;
                setMessage('');
                setPublication(s);
              }}
            >
              {s.isPublished ? c.unpublish : c.publish}
            </Button>
          </div>
        ))}
      </section>
      <div className="raak-actions">
        {serviceCursor ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  const p = await apiRequest<{ items: Service[]; nextCursor: string | null }>(
                    `/agency/services?cursor=${serviceCursor}`,
                  );
                  setServices((old) => [...old, ...p.items]);
                  setServiceCursor(p.nextCursor);
                } catch {
                  setMessage(c.error);
                }
              })
            }
          >
            {c.next} · {c.services}
          </Button>
        ) : null}
        {templateCursor ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  const p = await apiRequest<{
                    items: typeof templates;
                    nextCursor: string | null;
                  }>(`/catalog/platform-templates?cursor=${templateCursor}`);
                  setTemplates((old) => [...old, ...p.items]);
                  setTemplateCursor(p.nextCursor);
                } catch {
                  setMessage(c.error);
                }
              })
            }
          >
            {c.next} · {c.templates}
          </Button>
        ) : null}
      </div>
      <form
        className="raak-form"
        onSubmit={(e) => {
          e.preventDefault();
          action(async () => {
            const result = await apiRequest<Service>(
              selected ? `/agency/services/${selected.id}` : '/agency/services',
              {
                method: selected ? 'PATCH' : 'POST',
                body: JSON.stringify({
                  slug,
                  config,
                  ...(selected ? { expectedVersion: selected.version, isEnabled: enabled } : {}),
                }),
              },
            );
            pick(result);
          });
        }}
      >
        <h2>{selected ? c.edit : c.create}</h2>
        <Field id="slug" label={c.slug}>
          <Input
            id="slug"
            dir="ltr"
            value={slug}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={80}
            onChange={(e) => setSlug(e.target.value)}
          />
        </Field>
        {(
          ['nameAr', 'nameEn', 'summaryAr', 'summaryEn', 'descriptionAr', 'descriptionEn'] as const
        ).map((field) => (
          <Field id={field} label={c[field]} key={field}>
            <Textarea
              id={field}
              dir={field.endsWith('Ar') ? 'rtl' : 'ltr'}
              value={config[field]}
              required
              maxLength={field.startsWith('name') ? 120 : field.startsWith('summary') ? 300 : 3000}
              rows={field.startsWith('description') ? 3 : 1}
              onChange={(e) => setConfig((old) => ({ ...old, [field]: e.target.value }))}
            />
          </Field>
        ))}
        <Field id="durationMin" label={c.duration}>
          <Input
            id="durationMin"
            type="number"
            min={15}
            max={720}
            value={config.durationMin}
            onChange={(e) => setConfig((old) => ({ ...old, durationMin: Number(e.target.value) }))}
          />
        </Field>
        {select('clinicalClass', ['NON_CLINICAL', 'CLINICAL'])}
        <Field id="qualifications" label={c.qualifications}>
          <Input
            id="qualifications"
            dir="ltr"
            value={config.requiredQualificationCodes.join(',')}
            onChange={(e) =>
              setConfig((old) => ({
                ...old,
                requiredQualificationCodes: e.target.value
                  .split(',')
                  .map((v) => v.trim())
                  .filter(Boolean),
              }))
            }
          />
        </Field>
        <Field id="serviceAreas" label={c.area}>
          <Input
            id="serviceAreas"
            dir="ltr"
            value={config.serviceAreaIds.join(',')}
            required
            onChange={(e) =>
              setConfig((old) => ({
                ...old,
                serviceAreaIds: e.target.value
                  .split(',')
                  .map((v) => v.trim())
                  .filter(Boolean),
              }))
            }
          />
        </Field>
        {select('pricingType', ['FIXED', 'STARTING_FROM', 'CUSTOM_QUOTE'])}
        {config.pricingType !== 'CUSTOM_QUOTE' ? (
          <>
            {select('pricingUnit', ['VISIT', 'HOUR', 'SESSION'])}
            <Field id="priceMinor" label={c.priceMinor}>
              <Input
                id="priceMinor"
                type="number"
                min={0}
                max={100000000}
                value={config.priceMinor ?? 0}
                onChange={(e) =>
                  setConfig((old) => ({ ...old, priceMinor: Number(e.target.value) }))
                }
              />
            </Field>
          </>
        ) : null}
        <CheckboxField
          id="standalone"
          label={c.standalone}
          checked={config.allowStandalone}
          onChange={(e) => setConfig((old) => ({ ...old, allowStandalone: e.target.checked }))}
        />
        <CheckboxField
          id="recurring"
          label={c.recurring}
          checked={config.allowRecurring}
          onChange={(e) => setConfig((old) => ({ ...old, allowRecurring: e.target.checked }))}
        />
        {selected ? (
          <CheckboxField
            id="enabled"
            label={c.enabled}
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        ) : null}
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? c.loading : c.save}
        </Button>
      </form>
      <Dialog
        open={!!publication}
        onOpenChange={(open) => {
          if (!open) setPublication(null);
        }}
      >
        <DialogContent
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            publicationOpener.current?.focus();
          }}
        >
          <div className="rv-dialog-header">
            <div>
              <DialogTitle>{publication?.isPublished ? c.unpublish : c.publish}</DialogTitle>
              <DialogDescription>
                {publication?.isPublished ? c.unpublishHint : c.publishHint}
              </DialogDescription>
            </div>
          </div>
          <div className="rv-dialog-body">
            <p>{publication ? localized(publication.config, locale) : ''}</p>
            {message ? <Feedback title={message} tone="error" /> : null}
          </div>
          <div className="rv-dialog-footer">
            <DialogClose asChild>
              <Button variant="secondary" disabled={pending}>
                {c.close}
              </Button>
            </DialogClose>
            <Button
              disabled={pending}
              aria-busy={pending}
              onClick={() => {
                if (!publication) return;
                action(async () => {
                  await apiRequest(
                    `/agency/services/${publication.id}/${publication.isPublished ? 'unpublish' : 'publish'}`,
                    {
                      method: 'POST',
                      body: JSON.stringify({ expectedVersion: publication.version }),
                    },
                  );
                  setPublication(null);
                });
              }}
            >
              {pending ? c.loading : c.confirm}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </CatalogFrame>
  );
}
