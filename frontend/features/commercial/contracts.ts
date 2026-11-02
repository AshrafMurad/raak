// Frontend DTO projection of the Sprint 3 commercial API (docs/07); no
// backend-source dependency.
export interface QuoteLineItem {
  description: string;
  quantity: number;
  unitPriceMinor: number;
}

export interface QuoteView {
  id: string;
  quoteGroupId: string;
  version: number;
  status: 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED';
  currency: string;
  totalMinor: number;
  lineItems: QuoteLineItem[];
  terms: string;
  validUntil: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  rowVersion?: number;
  rawStatus?: string;
  revisionPending?: boolean;
}

export interface AgencyQuoteView extends QuoteView {
  rowVersion: number;
  rawStatus: string;
}

export interface RevisionView {
  id: string;
  quoteId: string;
  status: 'PENDING' | 'RESOLVED' | 'DECLINED' | 'WITHDRAWN';
  message: string;
  createdAt: string;
  resolvedAt: string | null;
  declineReason: string | null;
}
