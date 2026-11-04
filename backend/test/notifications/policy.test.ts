import { expect, it } from 'vitest';
import { NotificationPolicyPatchSchema, channelPolicy } from '../../src/contracts/notifications';

it('protects essential channels while allowing only configurable cells', () => {
  expect(channelPolicy('VISIT_CANCELLED', 'EMAIL').configurable).toBe(false);
  expect(channelPolicy('REQUEST_NEW', 'IN_APP').configurable).toBe(false);
  expect(NotificationPolicyPatchSchema.safeParse({ expectedVersion: 0, policies: [
    { eventType: 'VISIT_CANCELLED', channel: 'EMAIL', enabled: false },
  ] }).success).toBe(false);
  expect(NotificationPolicyPatchSchema.safeParse({ expectedVersion: 0, policies: [
    { eventType: 'REQUEST_NEW', channel: 'EMAIL', enabled: false },
  ] }).success).toBe(true);
});

it('rejects duplicate cells, unknown fields and offsets on non-reminders', () => {
  const cell = { eventType: 'REQUEST_NEW', channel: 'EMAIL', enabled: true };
  expect(NotificationPolicyPatchSchema.safeParse({ expectedVersion: 0, policies: [cell, cell] }).success).toBe(false);
  expect(NotificationPolicyPatchSchema.safeParse({ expectedVersion: 0, policies: [{ ...cell, tenantId: 'spoof' }] }).success).toBe(false);
  expect(NotificationPolicyPatchSchema.safeParse({ expectedVersion: 0, policies: [{ ...cell, reminderOffsetMin: 120 }] }).success).toBe(false);
});
