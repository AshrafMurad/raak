ALTER TABLE "tenants" ADD COLUMN "brand_json" JSONB, ADD COLUMN "brand_version" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "platform_services" (
 "id" UUID PRIMARY KEY, "code" TEXT NOT NULL, "config" JSONB NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX "platform_services_code_key" ON "platform_services"("code");
CREATE TABLE "agency_services" (
 "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "template_id" UUID, "slug" TEXT NOT NULL, "config" JSONB NOT NULL,
 "is_enabled" BOOLEAN NOT NULL DEFAULT true, "is_published" BOOLEAN NOT NULL DEFAULT false, "version" INTEGER NOT NULL DEFAULT 1,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "agency_services_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "agency_services_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "platform_services"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "agency_service_version_positive" CHECK ("version" > 0),
 CONSTRAINT "published_requires_enabled" CHECK (NOT "is_published" OR "is_enabled")
);
CREATE UNIQUE INDEX "agency_services_tenant_id_id_key" ON "agency_services"("tenant_id", "id");
CREATE UNIQUE INDEX "agency_services_tenant_id_slug_key" ON "agency_services"("tenant_id", "slug");
CREATE INDEX "agency_services_tenant_id_is_published_idx" ON "agency_services"("tenant_id", "is_published");
CREATE TABLE "service_requests" (
 "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "agency_service_id" UUID NOT NULL, "reference" TEXT NOT NULL,
 "idempotency_key" TEXT NOT NULL, "payload_hash" TEXT NOT NULL, "requester_name" TEXT NOT NULL, "requester_email_normalized" TEXT NOT NULL,
 "requester_phone" TEXT NOT NULL, "beneficiary_name" TEXT NOT NULL, "relationship" TEXT NOT NULL, "area_id" TEXT NOT NULL,
 "preferred_window_json" JSONB NOT NULL, "notes_restricted" TEXT NOT NULL, "locale" TEXT NOT NULL, "privacy_version" TEXT NOT NULL,
 "service_snapshot" JSONB NOT NULL, "price_acknowledged" BOOLEAN NOT NULL, "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
 "version" INTEGER NOT NULL DEFAULT 1, "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "service_requests_tenant_id_agency_service_id_fkey" FOREIGN KEY ("tenant_id", "agency_service_id") REFERENCES "agency_services"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "request_status_valid" CHECK ("status" IN ('SUBMITTED','UNDER_REVIEW','AWAITING_CUSTOMER','APPROVED','REJECTED','WITHDRAWN')),
 CONSTRAINT "request_version_positive" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "service_requests_tenant_id_id_key" ON "service_requests"("tenant_id", "id");
CREATE UNIQUE INDEX "service_requests_tenant_id_reference_key" ON "service_requests"("tenant_id", "reference");
CREATE UNIQUE INDEX "service_requests_tenant_id_idempotency_key_key" ON "service_requests"("tenant_id", "idempotency_key");
CREATE INDEX "service_requests_tenant_id_status_submitted_at_idx" ON "service_requests"("tenant_id", "status", "submitted_at");
CREATE TABLE "request_status_history" (
 "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "request_id" UUID NOT NULL, "from_status" TEXT, "to_status" TEXT NOT NULL,
 "actor_id" UUID, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "request_status_history_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id", "request_id") REFERENCES "service_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "request_status_history_tenant_id_request_id_idx" ON "request_status_history"("tenant_id", "request_id");
CREATE TABLE "guest_action_tokens" (
 "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "request_id" UUID NOT NULL, "token_hash" TEXT NOT NULL, "encrypted_secret" TEXT,
 "purpose" TEXT NOT NULL DEFAULT 'REQUEST_STATUS', "email_hash" TEXT NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL, "consumed_at" TIMESTAMP(3),
 CONSTRAINT "guest_action_tokens_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id", "request_id") REFERENCES "service_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "guest_action_tokens_token_hash_key" ON "guest_action_tokens"("token_hash");
CREATE INDEX "guest_action_tokens_tenant_id_request_id_idx" ON "guest_action_tokens"("tenant_id", "request_id");
CREATE TABLE "guest_sessions" (
 "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "request_id" UUID NOT NULL, "secret_hash" TEXT NOT NULL, "expires_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "guest_sessions_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id", "request_id") REFERENCES "service_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "guest_sessions_secret_hash_key" ON "guest_sessions"("secret_hash");
CREATE INDEX "guest_sessions_tenant_id_request_id_idx" ON "guest_sessions"("tenant_id", "request_id");
CREATE TABLE "request_notifications" (
 "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "request_id" UUID NOT NULL, "staff_id" UUID NOT NULL,
 "read_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "request_notifications_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id", "request_id") REFERENCES "service_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "request_notifications_tenant_id_request_id_staff_id_key" ON "request_notifications"("tenant_id", "request_id", "staff_id");
CREATE TABLE "email_deliveries" (
 "id" UUID PRIMARY KEY, "event_id" UUID NOT NULL, "tenant_id" UUID NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
 "attempts" INTEGER NOT NULL DEFAULT 0, "retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lease_until" TIMESTAMP(3), "last_error_code" TEXT
);
CREATE UNIQUE INDEX "email_deliveries_event_id_key" ON "email_deliveries"("event_id");
CREATE INDEX "email_deliveries_status_retry_at_idx" ON "email_deliveries"("status", "retry_at");
