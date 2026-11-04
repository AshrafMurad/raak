import { z } from 'zod';
import type { NotificationChannel } from './enums';
export type { NotificationChannel } from './enums';

export const NOTIFICATION_EVENTS = [
  'REQUEST_RECEIVED',
  'REQUEST_NEW',
  'REQUEST_NEEDS_INFO',
  'QUOTE_SENT',
  'QUOTE_RESPONSE',
  'QUOTE_REVISION_REQUESTED',
  'QUOTE_REVISION_SENT',
  'VISIT_CONFIRMED',
  'VISIT_CHANGED',
  'VISIT_CANCELLED',
  'VISIT_ASSIGNED',
  'VISIT_REMINDER',
  'VISIT_LATE_FLAGGED',
  'VISIT_NEEDS_REVIEW',
  'CAREGIVER_EXCEPTION',
  'STAFF_INVITATION',
  'SECURITY_VERIFICATION',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];
export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL'] as const;

/** docs 11: only cells explicitly labelled configurable permit overrides. */
export function channelPolicy(event: NotificationEvent, channel: NotificationChannel) {
  const emailOnly = event === 'STAFF_INVITATION' || event === 'SECURITY_VERIFICATION';
  const configurable =
    event === 'VISIT_REMINDER' ||
    (channel === 'EMAIL' &&
      [
        'REQUEST_NEW',
        'QUOTE_RESPONSE',
        'QUOTE_REVISION_REQUESTED',
        'VISIT_ASSIGNED',
        'VISIT_LATE_FLAGGED',
        'VISIT_NEEDS_REVIEW',
        'CAREGIVER_EXCEPTION',
      ].includes(event));
  return { configurable, enabled: !(emailOnly && channel === 'IN_APP') };
}

const PolicyCellSchema = z
  .object({
    eventType: z.enum(NOTIFICATION_EVENTS),
    channel: z.enum(NOTIFICATION_CHANNELS),
    enabled: z.boolean(),
    reminderOffsetMin: z.number().int().min(1).max(10080).nullable().optional(),
  })
  .strict()
  .superRefine((cell, ctx) => {
    if (!channelPolicy(cell.eventType, cell.channel).configurable)
      ctx.addIssue({ code: 'custom', message: 'This notification channel is protected.' });
    if (cell.reminderOffsetMin != null && cell.eventType !== 'VISIT_REMINDER')
      ctx.addIssue({ code: 'custom', message: 'Only reminder policies accept an offset.' });
  });
export const NotificationPolicyPatchSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    policies: z.array(PolicyCellSchema).min(1).max(34),
  })
  .strict()
  .superRefine((input, ctx) => {
    const keys = input.policies.map((p) => `${p.eventType}:${p.channel}`);
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate notification policy cell.' });
  });
export const DeliveryQuerySchema = z
  .object({
    status: z.enum(['PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED']).optional(),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const NotificationEvents = {
  POLICY_UPDATED: 'notifications.policy_updated',
  PREFERENCES_UPDATED: 'notifications.preferences_updated',
} as const;

export const InboxQuerySchema = z
  .object({
    unreadOnly: z.enum(['true', 'false']).default('false'),
    cursor: z
      .string()
      .max(100)
      .refine((value) => {
        const [at, id, extra] = value.split('~');
        return !extra && z.iso.datetime().safeParse(at).success && z.uuid().safeParse(id).success;
      })
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const NotificationReadSchema = z.object({}).strict();
export const NotificationPreferencePatchSchema = z
  .object({
    preferences: z
      .array(
        z
          .object({
            eventType: z.enum(NOTIFICATION_EVENTS),
            channel: z.enum(NOTIFICATION_CHANNELS),
            optedOut: z.boolean(),
          })
          .strict()
          .refine(
            (cell) => channelPolicy(cell.eventType, cell.channel).configurable,
            'This notification channel is protected.',
          ),
      )
      .min(1)
      .max(34),
  })
  .strict()
  .refine(
    (input) =>
      new Set(input.preferences.map((p) => `${p.eventType}:${p.channel}`)).size ===
      input.preferences.length,
    'Duplicate notification preference cell.',
  );
