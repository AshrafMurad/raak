-- Additive integrity guards; conflicting legacy data fails migration instead
-- of silently repairing or deleting ownership/history.
ALTER TABLE "caregiver_qualifications" ADD CONSTRAINT "caregiver_qualifications_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "documents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "caregiver_service_authorizations" ADD CONSTRAINT "caregiver_service_authorizations_tenant_id_agency_service__fkey" FOREIGN KEY ("tenant_id", "agency_service_id") REFERENCES "agency_services"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_tenant_id_customer_account_id_fkey" FOREIGN KEY ("tenant_id", "customer_account_id") REFERENCES "customer_accounts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patients" ADD CONSTRAINT "patients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_access" ADD CONSTRAINT "patient_access_tenant_id_evidence_document_id_fkey" FOREIGN KEY ("tenant_id", "evidence_document_id") REFERENCES "documents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_access" ADD CONSTRAINT "patient_access_tenant_id_verified_by_staff_id_fkey" FOREIGN KEY ("tenant_id", "verified_by_staff_id") REFERENCES "staff_accounts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_duplicate_reviews" ADD CONSTRAINT "patient_duplicate_reviews_tenant_id_reviewed_by_fkey" FOREIGN KEY ("tenant_id", "reviewed_by") REFERENCES "staff_accounts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
