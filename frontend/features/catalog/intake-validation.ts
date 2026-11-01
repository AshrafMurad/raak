export interface IntakeDraft {
  requesterName: string;
  requesterEmail: string;
  beneficiaryName: string;
  areaId: string;
  preferredDate: string;
  privacyAccepted: boolean;
  priceAcknowledged: boolean;
}
export function invalidIntakeFields(
  step: number,
  draft: IntakeDraft,
  fixedPrice: boolean,
): string[] {
  if (step === 1)
    return [
      !draft.requesterName.trim() && 'requesterName',
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.requesterEmail) && 'requesterEmail',
      !draft.beneficiaryName.trim() && 'beneficiaryName',
    ].filter((s): s is string => !!s);
  if (step === 2)
    return [
      !draft.areaId && 'areaId',
      !/^\d{4}-\d{2}-\d{2}$/.test(draft.preferredDate) && 'preferredDate',
    ].filter((s): s is string => !!s);
  if (step === 3)
    return [
      !draft.privacyAccepted && 'privacyAccepted',
      fixedPrice && !draft.priceAcknowledged && 'priceAcknowledged',
    ].filter((s): s is string => !!s);
  return [];
}
