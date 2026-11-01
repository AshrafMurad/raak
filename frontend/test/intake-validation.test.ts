import { expect, it } from 'vitest';
import en from '../messages/en/catalog.json';
import ar from '../messages/ar/catalog.json';
import { invalidIntakeFields } from '../features/catalog/intake-validation';
const draft = {
  requesterName: 'Synthetic requester',
  requesterEmail: 'synthetic@example.invalid',
  beneficiaryName: 'Different synthetic beneficiary',
  areaId: 'central',
  preferredDate: '2026-12-01',
  privacyAccepted: true,
  priceAcknowledged: true,
};
it('keeps both feature dictionaries in parity', () => {
  expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  expect(ar.steps).toHaveLength(4);
});
it('rejects missing requester and invalid email before advancing in either locale', () => {
  expect(
    invalidIntakeFields(1, { ...draft, requesterName: '', requesterEmail: 'invalid' }, true),
  ).toEqual(['requesterName', 'requesterEmail']);
  expect(invalidIntakeFields(1, draft, true)).toEqual([]);
});
it('requires explicit privacy and exact fixed-price acknowledgment', () => {
  expect(
    invalidIntakeFields(3, { ...draft, privacyAccepted: false, priceAcknowledged: false }, true),
  ).toEqual(['privacyAccepted', 'priceAcknowledged']);
  expect(invalidIntakeFields(3, { ...draft, priceAcknowledged: false }, false)).toEqual([]);
});
