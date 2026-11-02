import type { Prisma } from '../../db/generated/prisma/client';
import type { AuthState } from '../auth/guards';
import { agencyAction, missing } from '../common/agency-action';
import { customerAction } from '../common/customer-action';
import { hasPatientGrant } from '../patients/patient.repository';

export interface DocumentParent {
  parentType: string;
  parentId: string;
  classification: string;
}
export async function authorizeDocument(
  tx: Prisma.TransactionClient,
  auth: AuthState,
  parent: DocumentParent,
  write: boolean,
  now: () => Date,
) {
  if (auth.session.principalType === 'AGENCY_CUSTOMER') {
    const customer = await customerAction(tx, auth, 'documents.read_granted', now);
    // No write scope is invented from a read-only document grant. Authorization
    // evidence and qualification files are agency-only classifications.
    if (
      write ||
      parent.parentType !== 'PATIENT' ||
      parent.classification !== 'PATIENT_ATTACHMENT' ||
      !(await hasPatientGrant(
        tx,
        customer.tenantId,
        customer.id,
        parent.parentId,
        'VIEW_DOCUMENTS',
        now,
      ))
    )
      throw missing();
    if (
      !(await tx.patient.findFirst({
        where: { tenantId: customer.tenantId, id: parent.parentId },
        select: { id: true },
      }))
    )
      throw missing();
    return customer.tenantId;
  }
  const tenantId = await agencyAction(
    tx,
    auth,
    parent.classification === 'AUTHORIZATION_EVIDENCE' ? 'patients.grants' : 'documents.manage',
  );
  if (parent.parentType === 'PATIENT') {
    if (
      parent.classification === 'QUALIFICATION' ||
      !(await tx.patient.findFirst({
        where: { tenantId, id: parent.parentId },
        select: { id: true },
      }))
    )
      throw missing();
  } else if (parent.parentType === 'CAREGIVER') {
    if (
      parent.classification !== 'QUALIFICATION' ||
      !(await tx.caregiver.findFirst({
        where: { tenantId, id: parent.parentId },
        select: { id: true },
      }))
    )
      throw missing();
  } else throw missing();
  return tenantId;
}
