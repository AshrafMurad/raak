/**
 * Visit note transitions (docs 04 BR-VST, docs 06 visit_notes): exactly one
 * editable draft per visit/author until completion finalizes the snapshot;
 * finalized rows are immutable; corrections are append-only addenda that
 * reference — never rewrite — the original note.
 */
import type { Prisma } from '../../db/generated/prisma/client';
import { ApiError } from '../../api-error';

export async function lockVisitNoteRow(
  tx: Prisma.TransactionClient,
  tenantId: string,
  noteId: string,
) {
  await tx.$queryRaw`SELECT id FROM visit_notes WHERE tenant_id = ${tenantId}::uuid AND id = ${noteId}::uuid FOR UPDATE`;
}

/** Upsert the author's single draft; drafts are only writable while the
 * visit is IN_PROGRESS (service checks that state before calling). */
export async function saveDraftNote(
  tx: Prisma.TransactionClient,
  args: { tenantId: string; visitId: string; authorId: string; body: string },
) {
  const existing = await tx.visitNote.findFirst({
    where: {
      tenantId: args.tenantId,
      visitId: args.visitId,
      authorId: args.authorId,
      isDraft: true,
    },
    select: { id: true },
  });
  if (existing) {
    return tx.visitNote.update({
      where: { tenantId_id: { tenantId: args.tenantId, id: existing.id } },
      data: { bodyRestricted: args.body },
    });
  }
  return tx.visitNote.create({
    data: {
      tenantId: args.tenantId,
      visitId: args.visitId,
      authorId: args.authorId,
      bodyRestricted: args.body,
      isDraft: true,
    },
  });
}

/** Completion commits the immutable note snapshot: every remaining draft is
 * finalized with the server timestamp; no draft may exist afterwards. */
export async function finalizeVisitNotes(
  tx: Prisma.TransactionClient,
  tenantId: string,
  visitId: string,
  finalizedAt: Date,
) {
  await tx.visitNote.updateMany({
    where: { tenantId, visitId, isDraft: true },
    data: { isDraft: false, finalizedAt },
  });
}

/** Append-only correction addendum (I17). The parent, when supplied, must be
 * a finalized note of the same visit; originals are never modified. */
export async function appendCorrectionNote(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: string;
    visitId: string;
    authorId: string;
    parentNoteId: string | null;
    body: string;
    reason: string;
    finalizedAt: Date;
  },
) {
  if (args.parentNoteId) {
    await lockVisitNoteRow(tx, args.tenantId, args.parentNoteId);
    const parent = await tx.visitNote.findFirst({
      where: {
        tenantId: args.tenantId,
        id: args.parentNoteId,
        visitId: args.visitId,
        isDraft: false,
      },
      select: { id: true },
    });
    if (!parent)
      throw new ApiError(
        422,
        'VALIDATION_FAILED',
        'The corrected note must be a finalized note of this visit.',
      );
  }
  return tx.visitNote.create({
    data: {
      tenantId: args.tenantId,
      visitId: args.visitId,
      authorId: args.authorId,
      bodyRestricted: args.body,
      isDraft: false,
      isAddendum: true,
      parentNoteId: args.parentNoteId,
      reason: args.reason,
      finalizedAt: args.finalizedAt,
    },
  });
}
