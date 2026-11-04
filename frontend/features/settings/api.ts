import { apiRequest } from '../../lib/api-client';
import { flag, integer, objectOf, text } from '../../lib/response-validation';
const settings = objectOf({
  timezone: text,
  travelBufferMin: integer,
  changeCancelCutoffHours: integer,
  changeRescheduleCutoffHours: integer,
  allowLateReview: flag,
  settingsVersion: integer,
});
export type SchedulingSettings = ReturnType<typeof settings>;
export type PolicyInput = Omit<SchedulingSettings, 'timezone' | 'settingsVersion'> & {
  expectedVersion: number;
};
export function getSettings(signal?: AbortSignal) {
  return apiRequest('/agency/settings', { signal }).then(settings);
}
export function saveSettings(input: PolicyInput) {
  return apiRequest('/agency/settings', { method: 'PATCH', body: JSON.stringify(input) }).then(
    objectOf({ settingsVersion: integer, impact: objectOf({ flagged: integer, healed: integer }) }),
  );
}
export function validSettings(input: PolicyInput) {
  return (
    [
      input.travelBufferMin,
      input.changeCancelCutoffHours,
      input.changeRescheduleCutoffHours,
      input.expectedVersion,
    ].every(Number.isInteger) &&
    input.travelBufferMin >= 0 &&
    input.travelBufferMin <= 120 &&
    input.changeCancelCutoffHours >= 0 &&
    input.changeCancelCutoffHours <= 168 &&
    input.changeRescheduleCutoffHours >= 0 &&
    input.changeRescheduleCutoffHours <= 168 &&
    input.expectedVersion >= 0
  );
}
