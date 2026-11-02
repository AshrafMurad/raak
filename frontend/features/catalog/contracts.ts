// Frontend DTO projection of docs/07; no backend-source dependency.
export interface ServiceConfig {
  nameAr: string;
  nameEn: string;
  summaryAr: string;
  summaryEn: string;
  descriptionAr: string;
  descriptionEn: string;
  durationMin: number;
  clinicalClass: 'NON_CLINICAL' | 'CLINICAL';
  requiredQualificationCodes: string[];
  serviceAreaIds: string[];
  allowStandalone: boolean;
  allowRecurring: boolean;
  pricingType: 'FIXED' | 'STARTING_FROM' | 'CUSTOM_QUOTE';
  priceMinor: number | null;
  pricingUnit: 'VISIT' | 'HOUR' | 'SESSION' | null;
}
export interface Service {
  id: string;
  slug: string;
  config: ServiceConfig;
  version: number;
  isPublished?: boolean;
  isEnabled?: boolean;
}
export interface Branding {
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  primaryColor: 'MIDNIGHT' | 'LAVENDER';
  areas: { id: string; nameAr: string; nameEn: string }[];
  logoPng?: string | null;
}
export interface Portal {
  agency: { displayName: string; currency: string; timezone: string; brandJson: Branding | null };
  services: Service[];
  nextCursor: string | null;
}
export interface RequestView {
  id: string;
  reference: string;
  status: string;
  submittedAt: string;
  serviceSnapshot: ServiceConfig & { currency: string };
  version: number;
  history: { toStatus: string; at: string; reason?: string | null }[];
  requesterName?: string;
  requesterEmailNormalized?: string;
  requesterPhone?: string;
  beneficiaryName?: string;
  relationship?: string;
  areaId?: string;
  preferredWindowJson?: { date: string; period: string };
  notesRestricted?: string;
}
