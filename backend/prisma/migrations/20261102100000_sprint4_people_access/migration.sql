ALTER TABLE "service_requests" ADD COLUMN "patient_id" UUID;
CREATE UNIQUE INDEX "customer_accounts_tenant_id_id_key" ON "customer_accounts"("tenant_id", "id");

CREATE TABLE "customer_capabilities" (
 "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "customer_id" UUID NOT NULL,
 "request_id" UUID, "purpose" TEXT NOT NULL, "token_hash" TEXT NOT NULL,
 "encrypted_secret" TEXT, "email_hash" TEXT NOT NULL, "locale" TEXT NOT NULL,
 "expires_at" TIMESTAMP(3) NOT NULL, "consumed_at" TIMESTAMP(3),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "customer_capability_shape" CHECK (
   (purpose = 'VERIFY_EMAIL' AND request_id IS NULL) OR
   (purpose = 'CLAIM_REQUEST' AND request_id IS NOT NULL)),
 CONSTRAINT "customer_capability_locale" CHECK (locale IN ('ar','en'))
);
CREATE UNIQUE INDEX "customer_capabilities_token_hash_key" ON "customer_capabilities"("token_hash");
CREATE INDEX "customer_capabilities_tenant_id_customer_id_created_at_idx" ON "customer_capabilities"("tenant_id", "customer_id", "created_at");

CREATE TABLE "patients" (
 "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "display_name" TEXT NOT NULL,
 "normalized_name" TEXT NOT NULL, "date_of_birth" VARCHAR(10), "contact" TEXT NOT NULL DEFAULT '',
 "area_id" TEXT NOT NULL, "address_restricted" TEXT NOT NULL DEFAULT '',
 "notes_restricted" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'ACTIVE',
 "version" INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "patient_status" CHECK (status IN ('ACTIVE','ARCHIVED'))
);
CREATE INDEX "patients_tenant_id_normalized_name_idx" ON "patients"("tenant_id", "normalized_name");
CREATE UNIQUE INDEX "patients_tenant_id_id_key" ON "patients"("tenant_id", "id");

CREATE TABLE "patient_access" (
 "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "patient_id" UUID NOT NULL,
 "customer_account_id" UUID NOT NULL, "scopes" TEXT[] NOT NULL,
 "authorization_type" TEXT NOT NULL, "evidence_document_id" UUID,
 "verified_by_staff_id" UUID NOT NULL, "verified_at" TIMESTAMP(3) NOT NULL,
 "expires_at" TIMESTAMP(3), "revoked_at" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'ACTIVE',
 CONSTRAINT "patient_access_status" CHECK ((status = 'ACTIVE' AND revoked_at IS NULL) OR (status = 'REVOKED' AND revoked_at IS NOT NULL)),
 CONSTRAINT "patient_access_scopes" CHECK (cardinality(scopes) > 0 AND scopes <@ ARRAY['VIEW_BASIC','SUBMIT_REQUEST','VIEW_VISITS','MANAGE_VISITS','VIEW_CARE_PLAN_SUMMARY','VIEW_DOCUMENTS']::text[])
);
CREATE INDEX "patient_access_tenant_id_customer_account_id_patient_id_idx" ON "patient_access"("tenant_id", "customer_account_id", "patient_id");
CREATE UNIQUE INDEX "patient_access_one_active" ON "patient_access"("tenant_id", "patient_id", "customer_account_id") WHERE status = 'ACTIVE' AND revoked_at IS NULL;

CREATE TABLE "patient_duplicate_reviews" (
 "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "candidate_patient_id" UUID NOT NULL,
 "subject_id" UUID NOT NULL, "reviewed_by" UUID NOT NULL, "decision" TEXT NOT NULL,
 "reason" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "patient_duplicate_decision" CHECK (decision IN ('LINK','IGNORE'))
);
CREATE INDEX "patient_duplicate_reviews_tenant_id_subject_id_idx" ON "patient_duplicate_reviews"("tenant_id", "subject_id");

ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_capabilities" ADD CONSTRAINT "customer_capabilities_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customer_accounts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_capabilities" ADD CONSTRAINT "customer_capabilities_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id", "request_id") REFERENCES "service_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_access" ADD CONSTRAINT "patient_access_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_access" ADD CONSTRAINT "patient_access_tenant_id_customer_account_id_fkey" FOREIGN KEY ("tenant_id", "customer_account_id") REFERENCES "customer_accounts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patient_duplicate_reviews" ADD CONSTRAINT "patient_duplicate_reviews_tenant_id_candidate_patient_id_fkey" FOREIGN KEY ("tenant_id", "candidate_patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
