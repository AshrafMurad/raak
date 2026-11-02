ALTER TABLE "caregivers" ADD COLUMN "availability_revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX "caregivers_tenant_id_id_key" ON "caregivers"("tenant_id", "id");
CREATE TABLE "caregiver_qualifications" (
 "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "caregiver_id" UUID NOT NULL,
 "code" TEXT NOT NULL, "license_issuer" TEXT NOT NULL, "license_number_restricted" TEXT NOT NULL,
 "valid_through" VARCHAR(10), "document_id" UUID, "status" TEXT NOT NULL DEFAULT 'PENDING',
 "verified_by" UUID, "verified_at" TIMESTAMP(3), "version" INTEGER NOT NULL DEFAULT 1,
 CONSTRAINT "qualification_verification" CHECK (status IN ('PENDING','VERIFIED','REJECTED') AND (status != 'VERIFIED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)))
);
CREATE TABLE "caregiver_service_authorizations" (
 "tenant_id" UUID NOT NULL, "caregiver_id" UUID NOT NULL, "agency_service_id" UUID NOT NULL,
 "authorized_by" UUID NOT NULL, "authorized_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "caregiver_service_authorizations_pkey" PRIMARY KEY ("tenant_id","caregiver_id","agency_service_id")
);
CREATE TABLE "availability_slots" (
 "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "caregiver_id" UUID NOT NULL,
 "weekday" INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6), "local_start_time" VARCHAR(5) NOT NULL,
 "local_end_time" VARCHAR(5) NOT NULL, "effective_from" VARCHAR(10), "effective_to" VARCHAR(10),
 CONSTRAINT "availability_slot_order" CHECK (local_start_time < local_end_time AND (effective_from IS NULL OR effective_to IS NULL OR effective_from <= effective_to))
);
CREATE TABLE "availability_exceptions" (
 "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "caregiver_id" UUID NOT NULL,
 "local_date" VARCHAR(10) NOT NULL, "start_local" VARCHAR(5), "end_local" VARCHAR(5),
 "type" TEXT NOT NULL, "reason" TEXT NOT NULL, "approved_by" UUID NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "availability_exception_shape" CHECK (
  (type = 'UNAVAILABLE' AND start_local IS NULL AND end_local IS NULL) OR
  (type = 'OVERRIDE_HOURS' AND start_local IS NOT NULL AND end_local IS NOT NULL AND start_local < end_local))
);
CREATE TABLE "documents" (
 "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "parent_type" TEXT NOT NULL, "parent_id" UUID NOT NULL,
 "classification" TEXT NOT NULL, "storage_key" TEXT NOT NULL, "original_name_restricted" TEXT NOT NULL,
 "mime" TEXT NOT NULL, "size_bytes" INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
 "checksum" TEXT, "scan_status" TEXT NOT NULL DEFAULT 'PENDING', "created_by" UUID NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "upload_expires_at" TIMESTAMP(3) NOT NULL,
 "archived_at" TIMESTAMP(3),
 CONSTRAINT "document_scan_status" CHECK (scan_status IN ('PENDING','PROCESSING','CLEAN','QUARANTINED','REJECTED')),
 CONSTRAINT "document_classification" CHECK (
  (parent_type = 'PATIENT' AND classification IN ('PATIENT_ATTACHMENT','AUTHORIZATION_EVIDENCE')) OR
  (parent_type = 'CAREGIVER' AND classification = 'QUALIFICATION'))
);
CREATE TABLE "document_tickets" (
 "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "document_id" UUID NOT NULL,
 "session_id" UUID NOT NULL, "secret_hash" TEXT NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "caregiver_qualifications_tenant_id_caregiver_id_idx" ON "caregiver_qualifications"("tenant_id", "caregiver_id");
CREATE INDEX "availability_slots_tenant_id_caregiver_id_weekday_idx" ON "availability_slots"("tenant_id", "caregiver_id", "weekday");
CREATE UNIQUE INDEX "availability_exceptions_tenant_id_caregiver_id_local_date_key" ON "availability_exceptions"("tenant_id", "caregiver_id", "local_date");
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");
CREATE INDEX "documents_tenant_id_parent_type_parent_id_idx" ON "documents"("tenant_id", "parent_type", "parent_id");
CREATE UNIQUE INDEX "documents_tenant_id_id_key" ON "documents"("tenant_id", "id");
CREATE UNIQUE INDEX "document_tickets_secret_hash_key" ON "document_tickets"("secret_hash");
ALTER TABLE "caregiver_qualifications" ADD CONSTRAINT "caregiver_qualifications_tenant_id_caregiver_id_fkey" FOREIGN KEY ("tenant_id", "caregiver_id") REFERENCES "caregivers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "caregiver_service_authorizations" ADD CONSTRAINT "caregiver_service_authorizations_tenant_id_caregiver_id_fkey" FOREIGN KEY ("tenant_id", "caregiver_id") REFERENCES "caregivers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_tenant_id_caregiver_id_fkey" FOREIGN KEY ("tenant_id", "caregiver_id") REFERENCES "caregivers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_tenant_id_caregiver_id_fkey" FOREIGN KEY ("tenant_id", "caregiver_id") REFERENCES "caregivers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_tickets" ADD CONSTRAINT "document_tickets_tenant_id_document_id_fkey" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "documents"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
