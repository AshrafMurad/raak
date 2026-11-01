import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
export const VersionSchema = z.strictObject({ expectedVersion: z.number().int().positive() });
export const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);
export const ServiceConfigSchema = z
  .strictObject({
    nameAr: text(120),
    nameEn: text(120),
    summaryAr: text(300),
    summaryEn: text(300),
    descriptionAr: text(3000),
    descriptionEn: text(3000),
    durationMin: z.number().int().min(15).max(720),
    clinicalClass: z.enum(['NON_CLINICAL', 'CLINICAL']),
    requiredQualificationCodes: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{1,49}$/)).max(20),
    serviceAreaIds: z.array(SlugSchema).min(1).max(50),
    allowStandalone: z.boolean(),
    allowRecurring: z.boolean(),
    pricingType: z.enum(['FIXED', 'STARTING_FROM', 'CUSTOM_QUOTE']),
    priceMinor: z.number().int().min(0).max(100_000_000).nullable(),
    pricingUnit: z.enum(['VISIT', 'HOUR', 'SESSION']).nullable(),
  })
  .superRefine((value, ctx) => {
    if (
      value.pricingType !== 'CUSTOM_QUOTE' &&
      (value.priceMinor === null || value.pricingUnit === null)
    )
      ctx.addIssue({ code: 'custom', path: ['priceMinor'], message: 'Price and unit required.' });
    if (
      value.pricingType === 'CUSTOM_QUOTE' &&
      (value.priceMinor !== null || value.pricingUnit !== null)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['priceMinor'],
        message: 'Custom quote has no public amount.',
      });
    if (value.clinicalClass === 'CLINICAL' && value.requiredQualificationCodes.length === 0)
      ctx.addIssue({
        code: 'custom',
        path: ['requiredQualificationCodes'],
        message: 'Qualification required.',
      });
    if (!value.allowStandalone && !value.allowRecurring)
      ctx.addIssue({
        code: 'custom',
        path: ['allowStandalone'],
        message: 'Select a delivery mode.',
      });
  });
export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;
export const CreateServiceSchema = z
  .strictObject({
    slug: SlugSchema,
    templateId: z.uuid().optional(),
    config: ServiceConfigSchema.optional(),
  })
  .refine((v) => !!v.templateId || !!v.config, 'Template or custom configuration required.');
export const EditServiceSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  slug: SlugSchema,
  config: ServiceConfigSchema,
  isEnabled: z.boolean(),
});
export const BrandingSchema = z.strictObject({
  nameAr: text(120),
  nameEn: text(120),
  descriptionAr: text(1000),
  descriptionEn: text(1000),
  primaryColor: z.enum(['MIDNIGHT', 'LAVENDER']).default('MIDNIGHT'),
  logoPng: z.string().max(175000).nullable().optional(),
  areas: z
    .array(z.strictObject({ id: SlugSchema, nameAr: text(120), nameEn: text(120) }))
    .min(1)
    .max(50),
});
export const EditBrandingSchema = z.strictObject({
  expectedVersion: z.number().int().nonnegative(),
  branding: BrandingSchema,
});
export const PRIVACY_VERSION = '2026-11-01';
export const GuestSubmissionSchema = z.strictObject({
  serviceId: z.uuid(),
  serviceVersion: z.number().int().positive(),
  locale: z.enum(['ar', 'en']),
  requesterName: text(120),
  requesterEmail: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  requesterPhone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+0-9 ()-]*$/)
    .default(''),
  beneficiaryName: text(120),
  relationship: z.enum(['SELF', 'FAMILY', 'OTHER']),
  areaId: SlugSchema,
  preferredDate: z.iso.date(),
  preferredPeriod: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'FLEXIBLE']),
  notes: z.string().trim().max(500).default(''),
  privacyAccepted: z.literal(true),
  privacyVersion: z.literal(PRIVACY_VERSION),
  priceAcknowledged: z.boolean(),
  website: z.string().max(200).default(''),
});
export type GuestSubmission = z.infer<typeof GuestSubmissionSchema>;
export const AccessLinkSchema = z.strictObject({
  reference: z.string().regex(/^REQ-[A-F0-9]{16}$/),
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  locale: z.enum(['ar', 'en']),
});
export const ConsumeGuestSchema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{40,100}$/),
});
