'use client';
import { useState, useTransition } from 'react';
import type { Locale } from '../../lib/i18n';
import { apiRequest } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import { CheckboxField, Field, Input } from '../../components/ui/field';
import { Feedback } from '../../components/ui/feedback';
import { Select } from '../../components/ui/select';
import { peopleCopy, peopleError, stateLabel } from './copy';
import type { Caregiver, Slot } from './contracts';
import { formatPeopleLocalDate } from './dates';

export function CaregiverAvailability({
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
  const [slots, setSlots] = useState<Slot[]>(caregiver.availabilitySlots);
  const [date, setDate] = useState('');
  const [type, setType] = useState('UNAVAILABLE');
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('17:00');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const complex = caregiver.availabilitySlots.some(
    (slot, index, all) =>
      slot.effectiveFrom ||
      slot.effectiveTo ||
      all.findIndex((s) => s.weekday === slot.weekday) !== index,
  );
  function save(path: string, body: object, method = 'POST') {
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
    <section className="raak-card">
      <h2>{c.availability}</h2>
      <p>
        <bdi>{caregiver.timezone}</bdi>
      </p>
      <p>{c.availabilityHelp}</p>
      {message ? <Feedback tone="error" title={message} /> : null}
      {complex ? (
        <>
          <Feedback title={c.multipleIntervals} />
          {slots.map((slot, i) => (
            <p key={i}>
              {c.weekdays[String(slot.weekday) as keyof typeof c.weekdays]} ·{' '}
              <bdi>
                {slot.localStartTime}–{slot.localEndTime} {slot.effectiveFrom} {slot.effectiveTo}
              </bdi>
            </p>
          ))}
        </>
      ) : (
        <form
          className="raak-form"
          onSubmit={(e) => {
            e.preventDefault();
            save(
              `/agency/caregivers/${caregiver.id}/availability`,
              { expectedRevision: caregiver.availabilityRevision, slots },
              'PUT',
            );
          }}
        >
          {[0, 1, 2, 3, 4, 5, 6].map((weekday) => {
            const slot = slots.find((s) => s.weekday === weekday);
            const day = c.weekdays[String(weekday) as keyof typeof c.weekdays];
            return (
              <fieldset key={weekday} className="raak-card" disabled={readOnly || pending}>
                <legend>{day}</legend>
                <CheckboxField
                  id={`day-${weekday}`}
                  label={c.enabled}
                  checked={!!slot}
                  onChange={(e) =>
                    setSlots((s) =>
                      e.target.checked
                        ? [
                            ...s,
                            {
                              weekday,
                              localStartTime: '09:00',
                              localEndTime: '17:00',
                              effectiveFrom: null,
                              effectiveTo: null,
                            },
                          ]
                        : s.filter((v) => v.weekday !== weekday),
                    )
                  }
                />
                {slot ? (
                  <div className="raak-actions">
                    {(['localStartTime', 'localEndTime'] as const).map((key) => (
                      <Field
                        key={key}
                        id={`${key}-${weekday}`}
                        label={key === 'localStartTime' ? c.start : c.end}
                      >
                        <Input
                          id={`${key}-${weekday}`}
                          type="time"
                          required
                          value={slot[key]}
                          onChange={(e) =>
                            setSlots((s) =>
                              s.map((v) =>
                                v.weekday === weekday ? { ...v, [key]: e.target.value } : v,
                              ),
                            )
                          }
                        />
                      </Field>
                    ))}
                  </div>
                ) : null}
              </fieldset>
            );
          })}
          {!readOnly ? (
            <Button type="submit" disabled={pending}>
              {c.save}
            </Button>
          ) : null}
        </form>
      )}
      <h3>{c.exceptions}</h3>
      {caregiver.exceptions.map((exception) => (
        <p key={exception.id}>
          <bdi>
            {formatPeopleLocalDate(exception.localDate, locale)} {exception.startLocal}{' '}
            {exception.endLocal}
          </bdi>{' '}
          · {stateLabel(c, exception.type)}
        </p>
      ))}
      {!readOnly ? (
        <form
          className="raak-form"
          onSubmit={(e) => {
            e.preventDefault();
            save(`/agency/caregivers/${caregiver.id}/exceptions`, {
              expectedRevision: caregiver.availabilityRevision,
              localDate: date,
              type,
              reason,
              startLocal: type === 'UNAVAILABLE' ? null : from,
              endLocal: type === 'UNAVAILABLE' ? null : to,
            });
          }}
        >
          <Field id="exception-date" label={c.date}>
            <Input
              id="exception-date"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field id="exception-type" label={c.exceptionType}>
            <Select
              id="exception-type"
              name="exceptionType"
              label={c.exceptionType}
              value={type}
              onValueChange={setType}
              dir={locale === 'ar' ? 'rtl' : 'ltr'}
              options={['UNAVAILABLE', 'OVERRIDE_HOURS'].map((value) => ({
                value,
                label: stateLabel(c, value),
              }))}
            />
          </Field>
          {type === 'OVERRIDE_HOURS' ? (
            <>
              <Field id="exception-start" label={c.start}>
                <Input
                  id="exception-start"
                  type="time"
                  required
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </Field>
              <Field id="exception-end" label={c.end}>
                <Input
                  id="exception-end"
                  type="time"
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </Field>
            </>
          ) : null}
          <Field id="exception-reason" label={c.reason}>
            <Input
              id="exception-reason"
              required
              minLength={5}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {c.save}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
