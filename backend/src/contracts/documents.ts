import { z } from 'zod';
export const DocumentEvents = {
  INTENT_CREATED: 'document.intent_created',
  UPLOAD_STARTED: 'document.upload_started',
  REJECTED: 'document.rejected',
  QUARANTINED: 'document.quarantined',
  CLEAN: 'document.clean',
  DOWNLOAD_AUTHORIZED: 'document.download_authorized',
} as const;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const UploadIntentSchema = z
  .strictObject({
    parentType: z.enum(['PATIENT', 'CAREGIVER']),
    parentId: z.uuid(),
    classification: z.enum(['PATIENT_ATTACHMENT', 'AUTHORIZATION_EVIDENCE', 'QUALIFICATION']),
    originalName: z
      .string()
      .min(1)
      .max(150)
      .refine(
        (s) =>
          !s.includes('/') &&
          !s.includes('\\') &&
          [...s].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127),
        'Invalid filename',
      ),
    mime: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
    sizeBytes: z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
  })
  .refine(
    (v) =>
      v.parentType === 'CAREGIVER'
        ? v.classification === 'QUALIFICATION'
        : v.classification !== 'QUALIFICATION',
    'Invalid parent classification',
  )
  .refine(
    (v) =>
      ({ 'application/pdf': /\.pdf$/i, 'image/jpeg': /\.jpe?g$/i, 'image/png': /\.png$/i })[
        v.mime
      ].test(v.originalName),
    'Extension and content type must match',
  );
