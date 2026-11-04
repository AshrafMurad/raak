'use client';
import { useCallback, useEffect, useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { ApiRequestError } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import { Field, Input, CheckboxField } from '../../components/ui/field';
import { Feedback } from '../../components/ui/feedback';
import ar from '../../messages/ar/settings.json';
import en from '../../messages/en/settings.json';
import { getSettings, saveSettings, validSettings, type SchedulingSettings } from './api';
import '../../components/layout/visit-flow.css';

export function SettingsScreen({ locale }: { locale: Locale }) {
  const c = locale === 'ar' ? ar : en;
  const [value, setValue] = useState<SchedulingSettings | null>(null);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'info' | 'error' | 'success'>('info');
  const [pending, start] = useTransition();
  const fail = useCallback(
    (e: unknown) => {
      setTone('error');
      setMessage(
        e instanceof ApiRequestError
          ? [401, 403, 404].includes(e.status)
            ? c.denied
            : e.code === 'VERSION_CONFLICT'
              ? c.stale
              : e.status === 422
                ? c.validation
                : c.error
          : c.error,
      );
    },
    [c],
  );
  useEffect(() => {
    const controller = new AbortController();
    void getSettings(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setValue(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) fail(e);
      });
    return () => controller.abort();
  }, [fail]);
  return (
    <section className="raak-execution">
      <div className="rv-page-heading">
        <div>
          <h1>{c.title}</h1>
          <p>{c.intro}</p>
        </div>
      </div>
      {message ? <Feedback title={message} tone={tone} /> : null}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              setValue(await getSettings());
              setMessage('');
            } catch (e) {
              fail(e);
            }
          })
        }
      >
        {c.refresh}
      </Button>
      {!value ? (
        <Feedback title={c.loading} />
      ) : (
        <form
          className="raak-card raak-form"
          onSubmit={(e) => {
            e.preventDefault();
            const input = {
              expectedVersion: value.settingsVersion,
              travelBufferMin: value.travelBufferMin,
              changeCancelCutoffHours: value.changeCancelCutoffHours,
              changeRescheduleCutoffHours: value.changeRescheduleCutoffHours,
              allowLateReview: value.allowLateReview,
            };
            if (!validSettings(input)) {
              setTone('error');
              setMessage(c.validation);
              return;
            }
            start(async () => {
              try {
                const result = await saveSettings(input);
                setValue({ ...value, settingsVersion: result.settingsVersion });
                setTone('success');
                setMessage(
                  c.savedScan
                    .replace('{flagged}', String(result.impact.flagged))
                    .replace('{healed}', String(result.impact.healed)),
                );
              } catch (error) {
                fail(error);
              }
            });
          }}
        >
          <p>
            {c.timezone}: <bdi>{value.timezone}</bdi>
          </p>
          {(
            [
              ['travelBufferMin', c.travelBuffer, c.travelBufferHelp, 120],
              ['changeCancelCutoffHours', c.cancelCutoff, c.cutoffHelp, 168],
              ['changeRescheduleCutoffHours', c.rescheduleCutoff, c.cutoffHelp, 168],
            ] as const
          ).map(([key, label, help, max]) => (
            <Field key={key} id={key} label={label} help={help}>
              <Input
                id={key}
                name={key}
                autoComplete="off"
                inputMode="numeric"
                dir="ltr"
                type="number"
                min={0}
                max={max}
                required
                value={value[key]}
                onChange={(e) => setValue({ ...value, [key]: e.target.valueAsNumber })}
              />
            </Field>
          ))}
          <CheckboxField
            id="allow-late"
            label={c.allowLateReview}
            checked={value.allowLateReview}
            onChange={(e) => setValue({ ...value, allowLateReview: e.target.checked })}
          />
          <p>{c.allowLateReviewHelp}</p>
          <Button type="submit" disabled={pending}>
            {c.save}
          </Button>
        </form>
      )}
    </section>
  );
}
