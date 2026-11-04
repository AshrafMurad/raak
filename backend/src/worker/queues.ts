/** Queue names. Outbox dispatch jobs are produced by later sprints (docs 08). */
export const QUEUES = {
  NOTIFICATION_EMAIL: 'raak-notification-email',
  OUTBOX_DISPATCH: 'raak-outbox-dispatch',
  REQUEST_EMAIL: 'raak-request-email',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
