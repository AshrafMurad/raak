'use client';

import { useState } from 'react';
import type { Locale } from '../../../lib/i18n';
import { Button } from '../../../components/ui/button';
import { CheckboxField, Field, Input, Textarea } from '../../../components/ui/field';
import { Feedback } from '../../../components/ui/feedback';
import { Select } from '../../../components/ui/select';
import { carePlanCopy } from '../copy';
import { planFieldErrors, validatePlanContent } from '../validation';
import type { OptionRecord, PlanContent } from '../contracts';

export function emptyPlanContent(): PlanContent {
  return {
    primaryCaregiverId: null,
    validFrom: '',
    validUntil: '',
    weekdays: [],
    localStartTime: '09:00',
    durationMin: 60,
    goalText: null,
    taskTemplates: [],
    clinicalInstructionsRestricted: null,
    dstResolution: 'REJECT',
  };
}

export function PlanEditor({
  locale,
  caregivers,
  initial,
  submitLabel,
  disabled,
  onSubmit,
}: {
  locale: Locale;
  caregivers: OptionRecord[];
  initial: PlanContent;
  submitLabel: string;
  disabled?: boolean;
  onSubmit(content: PlanContent): void;
}) {
  const c = carePlanCopy(locale);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const [content, setContent] = useState(initial);
  const [validationError, setValidationError] = useState(false);
  const errors = validationError ? planFieldErrors(content) : {};
  const fieldState = (key: keyof PlanContent, id: string) => ({
    'aria-invalid': !!errors[key],
    'aria-describedby': errors[key] ? `${id}-error` : undefined,
  });
  const update = <K extends keyof PlanContent>(key: K, value: PlanContent[K]) =>
    setContent((old) => ({ ...old, [key]: value }));

  return (
    <form
      className="raak-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const errors = validatePlanContent(content);
        setValidationError(errors.length > 0);
        if (errors.length > 0) {
          const form = event.currentTarget;
          requestAnimationFrame(() =>
            form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
          );
        }
        if (errors.length === 0) onSubmit(content);
      }}
    >
      {validationError ? <Feedback title={c.validation} tone="error" /> : null}
      <div className="raak-scheduling-grid">
        <Field id="plan-caregiver" label={c.primaryCaregiver}>
          <Select
            id="plan-caregiver"
            name="primaryCaregiverId"
            label={c.primaryCaregiver}
            dir={dir}
            value={content.primaryCaregiverId ?? 'NONE'}
            options={[
              { value: 'NONE', label: c.none },
              ...caregivers.map((item) => ({ value: item.id, label: item.name ?? item.id })),
            ]}
            onValueChange={(value) => update('primaryCaregiverId', value === 'NONE' ? null : value)}
          />
        </Field>
        <Field
          id="plan-from"
          label={c.validFrom}
          error={errors.validFrom ? c.validation : undefined}
        >
          <Input
            {...fieldState('validFrom', 'plan-from')}
            id="plan-from"
            type="date"
            required
            value={content.validFrom}
            onChange={(event) => update('validFrom', event.target.value)}
          />
        </Field>
        <Field
          id="plan-until"
          label={c.validUntil}
          error={errors.validUntil ? c.validation : undefined}
        >
          <Input
            {...fieldState('validUntil', 'plan-until')}
            id="plan-until"
            type="date"
            required
            value={content.validUntil}
            onChange={(event) => update('validUntil', event.target.value)}
          />
        </Field>
        <fieldset
          className="raak-scheduling-span"
          tabIndex={-1}
          {...fieldState('weekdays', 'plan-weekdays')}
        >
          <legend>{c.weekdaysLabel}</legend>
          <div className="raak-weekdays">
            {Object.entries(c.weekdays).map(([day, label]) => {
              const value = Number(day);
              return (
                <label key={day}>
                  <input
                    type="checkbox"
                    {...fieldState('weekdays', 'plan-weekdays')}
                    checked={content.weekdays.includes(value)}
                    onChange={(event) =>
                      update(
                        'weekdays',
                        event.target.checked
                          ? [...content.weekdays, value].sort()
                          : content.weekdays.filter((item) => item !== value),
                      )
                    }
                  />
                  {label}
                </label>
              );
            })}
          </div>
          {errors.weekdays ? (
            <p id="plan-weekdays-error" role="alert">
              {c.validation}
            </p>
          ) : null}
        </fieldset>
        <Field
          id="plan-time"
          label={c.startTime}
          error={errors.localStartTime ? c.validation : undefined}
        >
          <Input
            {...fieldState('localStartTime', 'plan-time')}
            id="plan-time"
            type="time"
            required
            value={content.localStartTime}
            onChange={(event) => update('localStartTime', event.target.value)}
          />
        </Field>
        <Field
          id="plan-duration"
          label={c.duration}
          error={errors.durationMin ? c.validation : undefined}
        >
          <Input
            {...fieldState('durationMin', 'plan-duration')}
            id="plan-duration"
            type="number"
            min={15}
            max={720}
            required
            value={content.durationMin}
            onChange={(event) => update('durationMin', Number(event.target.value))}
          />
        </Field>
        <Field id="plan-dst" label={c.dstResolution}>
          <Select
            id="plan-dst"
            name="dstResolution"
            label={c.dstResolution}
            dir={dir}
            value={content.dstResolution}
            options={[
              { value: 'REJECT', label: c.rejectDst },
              { value: 'EARLIEST', label: c.earliestDst },
              { value: 'LATEST', label: c.latestDst },
            ]}
            onValueChange={(value) =>
              update('dstResolution', value as PlanContent['dstResolution'])
            }
          />
        </Field>
        <Field id="plan-goal" label={c.goal} error={errors.goalText ? c.validation : undefined}>
          <Textarea
            {...fieldState('goalText', 'plan-goal')}
            id="plan-goal"
            maxLength={500}
            value={content.goalText ?? ''}
            onChange={(event) =>
              update('goalText', event.target.value.trim() ? event.target.value : null)
            }
          />
        </Field>
        <Field
          id="plan-clinical"
          label={c.clinicalInstructions}
          help={c.clinicalWarning}
          error={errors.clinicalInstructionsRestricted ? c.validation : undefined}
        >
          <Textarea
            {...fieldState('clinicalInstructionsRestricted', 'plan-clinical')}
            id="plan-clinical"
            maxLength={3000}
            rows={4}
            value={content.clinicalInstructionsRestricted ?? ''}
            onChange={(event) =>
              update(
                'clinicalInstructionsRestricted',
                event.target.value.trim() ? event.target.value : null,
              )
            }
          />
        </Field>
      </div>
      <fieldset>
        <legend>{c.tasks}</legend>
        {content.taskTemplates.map((task, index) => (
          <div className="raak-task-row" key={index}>
            <Field
              id={`plan-task-${index}`}
              label={c.task}
              error={errors.taskTemplates ? c.validation : undefined}
            >
              <Input
                {...fieldState('taskTemplates', `plan-task-${index}`)}
                id={`plan-task-${index}`}
                required
                maxLength={300}
                value={task.description}
                onChange={(event) =>
                  update(
                    'taskTemplates',
                    content.taskTemplates.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, description: event.target.value } : item,
                    ),
                  )
                }
              />
            </Field>
            <CheckboxField
              id={`plan-task-required-${index}`}
              label={c.requiredTask}
              checked={task.isRequired}
              onChange={(event) =>
                update(
                  'taskTemplates',
                  content.taskTemplates.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, isRequired: event.target.checked } : item,
                  ),
                )
              }
            />
            <Button
              variant="ghost"
              onClick={() =>
                update(
                  'taskTemplates',
                  content.taskTemplates.filter((_, itemIndex) => itemIndex !== index),
                )
              }
            >
              {c.remove}
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          disabled={content.taskTemplates.length >= 30}
          onClick={() =>
            update('taskTemplates', [
              ...content.taskTemplates,
              { description: '', isRequired: false },
            ])
          }
        >
          {c.addTask}
        </Button>
      </fieldset>
      <Button type="submit" disabled={disabled || content.weekdays.length === 0}>
        {submitLabel}
      </Button>
    </form>
  );
}
