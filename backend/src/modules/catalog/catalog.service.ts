import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import { appendAudit } from '../../db/audit';
import { enqueueOutbox } from '../../db/outbox';
import {
  BrandingSchema,
  ServiceConfigSchema,
  type CreateServiceSchema,
  type EditServiceSchema,
  type EditBrandingSchema,
} from '../../contracts/catalog';
import type { AuthState } from '../auth/guards';
import { agencyAction, lockActiveTenant, missing, stale } from './catalog.repository';
import { ApiError } from '../../api-error';
import { sanitizeLogoPng } from './logo';
import { CatalogEvents, type CatalogEvent } from '../../contracts/events';

export function createCatalogService(db: DatabaseClient) {
  function validateAreas(
    config: ReturnType<typeof ServiceConfigSchema.parse>,
    brand: ReturnType<typeof BrandingSchema.parse> | null,
  ) {
    if (brand && config.serviceAreaIds.some((id) => !brand.areas.some((a) => a.id === id)))
      throw new ApiError(422, 'VALIDATION_FAILED', 'Published service area is unavailable.');
  }
  async function changed(
    tx: Parameters<typeof appendAudit>[0],
    auth: AuthState,
    tenantId: string,
    id: string,
    action: CatalogEvent,
  ) {
    await appendAudit(tx, {
      tenantId,
      actorType: 'AGENCY_STAFF',
      actorId: auth.session.principalId,
      action,
      subjectType: action.startsWith('branding.') ? 'tenant_branding' : 'agency_service',
      subjectId: id,
    });
    await enqueueOutbox(tx, { tenantId, eventType: action, aggregateId: id, payloadMinimal: {} });
  }
  return {
    templates: (auth: AuthState, cursor?: string, limit = 20) =>
      db.$transaction(async (tx) => {
        await agencyAction(tx, auth, 'catalog.read');
        const rows = await tx.platformService.findMany({
          where: { active: true, ...(cursor ? { id: { gt: cursor } } : {}) },
          orderBy: { id: 'asc' },
          take: limit + 1,
        });
        const items = rows.slice(0, limit);
        return { items, nextCursor: rows.length > limit ? items.at(-1)?.id : null };
      }),
    list: (auth: AuthState, cursor?: string, limit = 20) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'catalog.read');
        const rows = await tx.agencyService.findMany({
          where: { tenantId, ...(cursor ? { id: { gt: cursor } } : {}) },
          orderBy: { id: 'asc' },
          take: limit + 1,
        });
        const items = rows.slice(0, limit);
        return { items, nextCursor: rows.length > limit ? items.at(-1)?.id : null };
      }),
    detail: (auth: AuthState, id: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'catalog.read');
        const row = await tx.agencyService.findFirst({ where: { tenantId, id } });
        if (!row) throw missing();
        return row;
      }),
    create: (auth: AuthState, input: z.infer<typeof CreateServiceSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'catalog.draft');
        const template = input.templateId
          ? await tx.platformService.findFirst({ where: { id: input.templateId, active: true } })
          : null;
        if (input.templateId && !template) throw missing();
        const config = ServiceConfigSchema.parse(input.config ?? template?.config);
        if (await tx.agencyService.findFirst({ where: { tenantId, slug: input.slug } }))
          throw new ApiError(409, 'VERSION_CONFLICT', 'Service slug is unavailable.');
        const row = await tx.agencyService.create({
          data: { tenantId, slug: input.slug, templateId: template?.id ?? null, config },
        });
        await changed(tx, auth, tenantId, row.id, CatalogEvents.CREATED);
        return row;
      }),
    edit: (auth: AuthState, id: string, input: z.infer<typeof EditServiceSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'catalog.draft');
        const row = await tx.agencyService.findFirst({ where: { tenantId, id } });
        if (!row) throw missing();
        if (row.version !== input.expectedVersion) throw stale();
        // A coordinator may prepare drafts; changing an already published offering is publication authority.
        if (row.isPublished) await agencyAction(tx, auth, 'catalog.publish');
        if (row.isPublished && input.isEnabled) {
          const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
          validateAreas(
            input.config,
            tenant.brandJson ? BrandingSchema.parse(tenant.brandJson) : null,
          );
        }
        if (
          await tx.agencyService.findFirst({
            where: { tenantId, slug: input.slug, id: { not: id } },
          })
        )
          throw stale();
        const updated = await tx.agencyService.update({
          where: { tenantId_id: { tenantId, id } },
          data: {
            slug: input.slug,
            config: input.config,
            isEnabled: input.isEnabled,
            isPublished: row.isPublished && input.isEnabled,
            version: { increment: 1 },
          },
        });
        await changed(tx, auth, tenantId, id, CatalogEvents.UPDATED);
        return updated;
      }),
    publish: (auth: AuthState, id: string, expectedVersion: number, published: boolean) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'catalog.publish');
        const row = await tx.agencyService.findFirst({ where: { tenantId, id } });
        if (!row) throw missing();
        if (row.version !== expectedVersion) throw stale();
        const config = ServiceConfigSchema.parse(row.config);
        const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        const brand = tenant.brandJson ? BrandingSchema.parse(tenant.brandJson) : null;
        if (published) validateAreas(config, brand);
        if (published && !row.isEnabled)
          throw new ApiError(422, 'VALIDATION_FAILED', 'Service configuration is unavailable.');
        const updated = await tx.agencyService.update({
          where: { tenantId_id: { tenantId, id } },
          data: { isPublished: published, version: { increment: 1 } },
        });
        await changed(
          tx,
          auth,
          tenantId,
          id,
          published ? CatalogEvents.PUBLISHED : CatalogEvents.UNPUBLISHED,
        );
        return updated;
      }),
    branding: (auth: AuthState) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'branding.manage');
        const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        return { branding: t.brandJson, version: t.brandVersion };
      }),
    updateBranding: (auth: AuthState, input: z.infer<typeof EditBrandingSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'branding.manage');
        const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
        if (t.brandVersion !== input.expectedVersion) throw stale();
        const published = await tx.agencyService.findMany({
          where: { tenantId, isPublished: true },
          select: { config: true },
        });
        for (const service of published)
          validateAreas(ServiceConfigSchema.parse(service.config), input.branding);
        let logoPng: string | null;
        try {
          logoPng = input.branding.logoPng ? sanitizeLogoPng(input.branding.logoPng) : null;
        } catch {
          throw new ApiError(422, 'VALIDATION_FAILED', 'Logo is unavailable.');
        }
        const t2 = await tx.tenant.update({
          where: { id: tenantId },
          data: { brandJson: { ...input.branding, logoPng }, brandVersion: { increment: 1 } },
        });
        await changed(tx, auth, tenantId, tenantId, CatalogEvents.BRANDING_UPDATED);
        return { branding: t2.brandJson, version: t2.brandVersion };
      }),
    portal: (tenantId: string, slug?: string, cursor?: string, limit = 20) =>
      db.$transaction(async (tx) => {
        await lockActiveTenant(tx, tenantId);
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { displayName: true, brandJson: true, currency: true, timezone: true },
        });
        const rows = await tx.agencyService.findMany({
          where: {
            tenantId,
            isEnabled: true,
            isPublished: true,
            ...(slug ? { slug } : {}),
            ...(cursor ? { id: { gt: cursor } } : {}),
          },
          orderBy: { id: 'asc' },
          take: limit + 1,
          select: { id: true, slug: true, config: true, version: true },
        });
        if (slug && !rows[0]) throw missing();
        const services = rows.slice(0, limit);
        return slug
          ? rows[0]!
          : {
              agency: tenant,
              services,
              nextCursor: rows.length > limit ? services.at(-1)?.id : null,
            };
      }),
  };
}
