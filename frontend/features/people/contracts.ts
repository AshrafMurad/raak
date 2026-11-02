export interface PatientProfile {
  displayName: string;
  dateOfBirth: string | null;
  contact: string;
  areaId: string;
  addressRestricted: string;
  notesRestricted: string;
}
export interface PatientSummary {
  id: string;
  displayName: string;
  status: string;
}
export interface Patient extends PatientProfile, PatientSummary {
  version: number;
}
export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
}
export interface Grant {
  id: string;
  customerAccountId: string;
  scopes: string[];
  status: string;
  effectiveStatus: string;
  verifiedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  authorizationType: string;
}
export interface PrivateDocument {
  id: string;
  scanStatus: string;
  mime: string;
  sizeBytes: number;
}
export interface Slot {
  weekday: number;
  localStartTime: string;
  localEndTime: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}
export interface Caregiver {
  id: string;
  name: string;
  professionalCategory: string;
  operationalStatus: string;
  serviceAreasJson: string[];
  version: number;
  availabilityRevision: number;
  timezone: string;
  qualifications: {
    id: string;
    code: string;
    status: string;
    effectiveStatus: string;
    version: number;
    validThrough: string | null;
  }[];
  serviceAuthorizations: { agencyServiceId: string }[];
  availabilitySlots: Slot[];
  exceptions: {
    id: string;
    localDate: string;
    type: string;
    startLocal: string | null;
    endLocal: string | null;
  }[];
}
