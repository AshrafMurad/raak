'use client';
import { useEffect, useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { apiRequest, privateDownloadHref } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import { Field, Input } from '../../components/ui/field';
import { Select } from '../../components/ui/select';
import { Feedback } from '../../components/ui/feedback';
import { peopleCopy, peopleError, stateLabel } from './copy';
import type { PrivateDocument } from './contracts';

export function PrivateFiles({
  locale,
  parentId,
  parentType,
  readOnly = false,
}: {
  locale: Locale;
  parentId: string;
  parentType: 'PATIENT' | 'CAREGIVER';
  readOnly?: boolean;
}) {
  const c = peopleCopy(locale);
  const [classification, setClassification] = useState(
    parentType === 'PATIENT' ? 'PATIENT_ATTACHMENT' : 'QUALIFICATION',
  );
  const [rows, setRows] = useState<PrivateDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const parent = { parentId, parentType, classification };
  async function load() {
    setRows(
      (
        await apiRequest<{ items: PrivateDocument[] }>('/documents/list', {
          method: 'POST',
          body: JSON.stringify(parent),
        })
      ).items,
    );
  }
  useEffect(() => {
    let active = true;
    apiRequest<{ items: PrivateDocument[] }>('/documents/list', {
      method: 'POST',
      body: JSON.stringify({ parentId, parentType, classification }),
    })
      .then((r) => {
        if (active) {
          setRows(r.items);
          setMessage('');
        }
      })
      .catch((e: unknown) => {
        if (active) setMessage(peopleError(c, e));
      });
    return () => {
      active = false;
    };
  }, [parentId, parentType, classification, c]);
  return (
    <section className="raak-card">
      <h2>{c.documents}</h2>
      <p>{c.fileHelp}</p>
      {message ? <Feedback tone="error" title={message} /> : null}
      {!readOnly ? (
        <form
          className="raak-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!file) return;
            start(async () => {
              setMessage('');
              try {
                if (
                  file.size > 5 * 1024 * 1024 ||
                  !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)
                ) {
                  setMessage(c.validation);
                  return;
                }
                const intent = await apiRequest<{ id: string }>(`/documents/upload-intent`, {
                  method: 'POST',
                  body: JSON.stringify({
                    ...parent,
                    originalName: file.name,
                    mime: file.type,
                    sizeBytes: file.size,
                  }),
                });
                await apiRequest(`/documents/${intent.id}/upload`, {
                  method: 'PUT',
                  headers: { 'Content-Type': file.type },
                  body: file,
                });
                await apiRequest(`/documents/${intent.id}/finalize`, {
                  method: 'POST',
                  body: '{}',
                });
                await load();
              } catch (e) {
                setMessage(peopleError(c, e));
                await load().catch(() => {});
              }
            });
          }}
        >
          {parentType === 'PATIENT' ? (
            <Field id="file-classification" label={c.classification}>
              <Select
                id="file-classification"
                name="classification"
                label={c.classification}
                value={classification}
                onValueChange={setClassification}
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
                options={['PATIENT_ATTACHMENT', 'AUTHORIZATION_EVIDENCE'].map((value) => ({
                  value,
                  label: c.classifications[value as keyof typeof c.classifications],
                }))}
              />
            </Field>
          ) : null}
          <Field id={`file-${parentId}`} label={c.file}>
            <Input
              id={`file-${parentId}`}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <Button type="submit" disabled={pending || !file}>
            {pending ? c.loading : c.upload}
          </Button>
        </form>
      ) : null}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              await load();
            } catch (e) {
              setMessage(peopleError(c, e));
            }
          })
        }
      >
        {c.refresh}
      </Button>
      {!rows.length ? (
        <Feedback title={c.empty} />
      ) : (
        rows.map((row) => (
          <article className="raak-card" key={row.id}>
            <bdi>{row.id}</bdi>
            <p role="status">
              {stateLabel(c, row.scanStatus)} · <bdi>{row.mime}</bdi>
            </p>
            {!readOnly && row.scanStatus === 'PROCESSING' ? (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    try {
                      await apiRequest(`/documents/${row.id}/finalize`, {
                        method: 'POST',
                        body: '{}',
                      });
                      await load();
                      setMessage('');
                    } catch (e) {
                      setMessage(peopleError(c, e));
                    }
                  })
                }
              >
                {c.checkScan}
              </Button>
            ) : null}
            {row.scanStatus === 'CLEAN' ? (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    try {
                      const result = await apiRequest<{ url: string }>(
                        `/documents/${row.id}/download`,
                      );
                      window.location.assign(privateDownloadHref(result.url));
                    } catch (e) {
                      setMessage(peopleError(c, e));
                    }
                  })
                }
              >
                {c.download}
              </Button>
            ) : null}
          </article>
        ))
      )}
    </section>
  );
}
