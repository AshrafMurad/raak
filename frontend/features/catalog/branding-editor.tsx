'use client';
import { useEffect, useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { apiRequest } from '../../lib/api-client';
import { Input, Field, Textarea } from '../../components/ui/field';
import { Button } from '../../components/ui/button';
import { Select } from '../../components/ui/select';
import { Feedback } from '../../components/ui/feedback';
import { catalogCopy } from './copy';
import type { Branding } from './contracts';

export function BrandingEditor({ locale }: { locale: Locale }) {
  const c = catalogCopy(locale);
  const [branding, setBranding] = useState<Branding>({
    nameAr: '',
    nameEn: '',
    descriptionAr: '',
    descriptionEn: '',
    primaryColor: 'MIDNIGHT',
    areas: [],
    logoPng: null,
  });
  const [version, setVersion] = useState(0);
  const [areas, setAreas] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    void apiRequest<{ branding: Branding | null; version: number }>('/agency/branding')
      .then((d) => {
        if (d.branding) {
          setBranding(d.branding);
          setAreas(d.branding.areas.map((a) => `${a.id} | ${a.nameAr} | ${a.nameEn}`).join('\n'));
        }
        setVersion(d.version);
      })
      .catch(() => setMessage(c.error));
  }, [c.error]);
  return (
    <>
      <h1>{c.branding}</h1>
      {message ? <Feedback title={message} /> : null}
      <form
        className="raak-form"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            try {
              const next = {
                ...branding,
                areas: areas
                  .split('\n')
                  .filter((v) => v.trim())
                  .map((line) => {
                    const [id = '', nameAr = '', nameEn = ''] = line
                      .split('|')
                      .map((v) => v.trim());
                    return { id, nameAr, nameEn };
                  }),
              };
              const d = await apiRequest<{ branding: Branding; version: number }>(
                '/agency/branding',
                {
                  method: 'PATCH',
                  body: JSON.stringify({ expectedVersion: version, branding: next }),
                },
              );
              setBranding(d.branding);
              setVersion(d.version);
              setMessage(c.saved);
            } catch {
              setMessage(c.error);
            }
          });
        }}
      >
        {(['nameAr', 'nameEn', 'descriptionAr', 'descriptionEn'] as const).map((field) => (
          <Field id={field} label={c[field]} key={field}>
            <Textarea
              id={field}
              required
              dir={field.endsWith('Ar') ? 'rtl' : 'ltr'}
              rows={field.startsWith('description') ? 3 : 1}
              maxLength={field.startsWith('description') ? 1000 : 120}
              value={branding[field]}
              onChange={(e) => setBranding((old) => ({ ...old, [field]: e.target.value }))}
            />
          </Field>
        ))}
        <Field id="areas" label={c.areasHint}>
          <Textarea
            id="areas"
            value={areas}
            required
            rows={4}
            onChange={(e) => setAreas(e.target.value)}
          />
        </Field>
        <Field id="primaryColor" label={c.primaryColor}>
          <Select
            id="primaryColor"
            name="primaryColor"
            label={c.primaryColor}
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
            value={branding.primaryColor}
            options={(['MIDNIGHT', 'LAVENDER'] as const).map((value) => ({
              value,
              label: c[value],
            }))}
            onValueChange={(v) =>
              setBranding((old) => ({ ...old, primaryColor: v as Branding['primaryColor'] }))
            }
          />
        </Field>
        <Field id="logo" label={c.logo}>
          <Input
            id="logo"
            type="file"
            accept="image/png"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 128 * 1024) {
                setMessage(c.error);
                return;
              }
              const reader = new FileReader();
              reader.onload = () =>
                setBranding((old) => ({
                  ...old,
                  logoPng: String(reader.result).split(',')[1] ?? null,
                }));
              reader.readAsDataURL(file);
            }}
          />
        </Field>
        <Button
          variant="secondary"
          onClick={() => setBranding((old) => ({ ...old, logoPng: null }))}
        >
          {c.removeLogo}
        </Button>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? c.loading : c.save}
        </Button>
      </form>
    </>
  );
}
