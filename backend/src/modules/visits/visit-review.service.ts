/**
 * Coordinator review and corrections (docs 04 BR-VST, docs 03 F08): review
 * is a separate `reviewStatus` transition that never touches completion
 * data; corrections are audited append-only addenda that preserve the
 * original finalized notes (I17).
 */
import type { z } from 'zod';
import type { DatabaseClient } from '../../db/client';
import type { Prisma } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';
import type { ReviewVisitSchema, VisitCorrectionSchema } from '../../contracts';
import { VisitEvents } from '../../contracts/events';
import type { AuthState } from '../auth/guards';
import { agencyAction, missing } from '../common/agency-action';
import { recordChange } from '../common/record-change';
import { appendCorrectionNote } from './visit-note.repository';

export interface AgencyVisitNote {
  id: string;
  authorId: string;
  bodyRestricted: string;
  isDraft: boolean;
  isAddendum: boolean;
  parentNoteId: string | null;
  reason: string | null;
  finalizedAt: Date | null;
  createdAt: Date;
}

export interface AgencyVisitReviewDetail {
  reviewStatus: string;
  notes: AgencyVisitNote[];
  reviews: { id: string; reviewerId: string; noteRestricted: string | null; createdAt: Date }[];
}

export function createVisitReviewService(db: DatabaseClient, now: () => Date) {
  /** Completed-visit documentation for the agency workspace (notes never
   * serialize to customer/caregiver-aggregate projections). */
  const completedDetail = async (
    tx: Prisma.TransactionClient,
    tenantId: string,
    visitId: string,
  ): Promise<AgencyVisitReviewDetail> => {
    const visit = await tx.visit.findFirst({
      where: { tenantId, id: visitId },
      select: {
        reviewStatus: true,
        notes: {
          select: {
            id: true,
            authorId: true,
            bodyRestricted: true,
            isDraft: true,
            isAddendum: true,
            parentNoteId: true,
            reason: true,
            finalizedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        reviews: {
          select: { id: true, reviewerId: true, noteRestricted: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!visit) throw missing();
    return visit;
  };

  return {
    detail: (auth: AuthState, visitId: string) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'visits.read');
        return completedDetail(tx, tenantId, visitId);
      }),

    review: (auth: AuthState, visitId: string, input: z.infer<typeof ReviewVisitSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'visits.review');
        await tx.$queryRaw`SELECT id FROM visits WHERE tenant_id = ${tenantId}::uuid AND id = ${visitId}::uuid FOR UPDATE`;
        const visit = await tx.visit.findFirst({ where: { tenantId, id: visitId } });
        if (!visit) throw missing();
        if (visit.status !== 'COMPLETED')
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'Only completed visits are reviewed.',
          );
        if (visit.reviewStatus === 'REVIEWED')
          throw new ApiError(409, 'STATE_TRANSITION_INVALID', 'This visit is already reviewed.');
        if (visit.version !== input.expectedVersion)
          throw new ApiError(409, 'VISIT_VERSION_CONFLICT', 'Visit changed; reload and retry.');
        const updated = await tx.visit.update({
          where: { tenantId_id: { tenantId, id: visit.id } },
          data: { reviewStatus: 'REVIEWED', version: { increment: 1 } },
          select: { id: true, reviewStatus: true, version: true },
        });
        const review = await tx.visitReview.create({
          data: {
            tenantId,
            visitId: visit.id,
            reviewerId: auth.session.principalId,
            noteRestricted: input.note ?? null,
          },
        });
        await recordChange(tx, auth, tenantId, visit.id, VisitEvents.REVIEWED, 'visit', {
          reviewId: review.id,
        });
        return updated;
      }),

    correction: (auth: AuthState, visitId: string, input: z.infer<typeof VisitCorrectionSchema>) =>
      db.$transaction(async (tx) => {
        const tenantId = await agencyAction(tx, auth, 'visits.review');
        await tx.$queryRaw`SELECT id FROM visits WHERE tenant_id = ${tenantId}::uuid AND id = ${visitId}::uuid FOR UPDATE`;
        const visit = await tx.visit.findFirst({ where: { tenantId, id: visitId } });
        if (!visit) throw missing();
        if (visit.status !== 'COMPLETED')
          throw new ApiError(
            409,
            'STATE_TRANSITION_INVALID',
            'Corrections apply to completed visit documentation.',
          );
        if (visit.version !== input.expectedVersion)
          throw new ApiError(409, 'VISIT_VERSION_CONFLICT', 'Visit changed; reload and retry.');
        const note = await appendCorrectionNote(tx, {
          tenantId,
          visitId: visit.id,
          authorId: auth.session.principalId,
          parentNoteId: input.parentNoteId,
          body: input.body,
          reason: input.reason,
          finalizedAt: now(),
        });
        await tx.visit.update({
          where: { tenantId_id: { tenantId, id: visit.id } },
          data: { version: { increment: 1 } },
          select: { version: true },
        });
        await recordChange(
          tx,
          auth,
          tenantId,
          visit.id,
          VisitEvents.CORRECTED,
          'visit',
          { noteId: note.id },
          input.reason,
        );
        return {
          visitId: visit.id,
          note: {
            id: note.id,
            parentNoteId: note.parentNoteId,
            reason: note.reason,
            createdAt: note.createdAt,
          },
        };
      }),
  };
}
