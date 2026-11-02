-- Sprint 3 — commercial quotes, revisions, request decisions, idempotency.
-- Additive only; no applied migration is edited.
ALTER TABLE "service_requests" ADD COLUMN "customer_account_id" UUID,
  ADD COLUMN "decision_at" TIMESTAMP(3), ADD COLUMN "decision_staff_id" UUID, ADD COLUMN "decision_reason" TEXT;
ALTER TABLE "request_status_history" ADD COLUMN "reason" TEXT;
ALTER TABLE "request_notifications" ADD COLUMN "event_type" TEXT NOT NULL DEFAULT 'REQUEST_NEW';
DROP INDEX "request_notifications_tenant_id_request_id_staff_id_key";
CREATE UNIQUE INDEX "request_notifications_tenant_id_request_id_staff_id_event_t_key"
  ON "request_notifications"("tenant_id", "request_id", "staff_id", "event_type");
CREATE TABLE "quotes" (
  "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "request_id" UUID NOT NULL, "quote_group_id" UUID NOT NULL,
  "version" INTEGER NOT NULL, "row_version" INTEGER NOT NULL DEFAULT 1, "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "currency" CHAR(3) NOT NULL, "line_items_snapshot" JSONB NOT NULL, "total_minor" INTEGER NOT NULL, "terms" TEXT NOT NULL,
  "valid_until" TIMESTAMP(3), "sent_at" TIMESTAMP(3), "accepted_at" TIMESTAMP(3), "rejected_at" TIMESTAMP(3),
  "accepted_by_type" TEXT, "accepted_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quotes_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id", "request_id") REFERENCES "service_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quote_version_positive" CHECK ("version" > 0),
  CONSTRAINT "quote_row_version_positive" CHECK ("row_version" > 0),
  CONSTRAINT "quote_total_nonnegative" CHECK ("total_minor" >= 0),
  CONSTRAINT "quote_status_valid" CHECK ("status" IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED','SUPERSEDED')),
  CONSTRAINT "quote_sent_freeze" CHECK ("status" = 'DRAFT' OR ("valid_until" IS NOT NULL AND "sent_at" IS NOT NULL)),
  CONSTRAINT "quote_draft_unset" CHECK ("status" <> 'DRAFT' OR ("valid_until" IS NULL AND "sent_at" IS NULL AND "accepted_at" IS NULL AND "rejected_at" IS NULL)),
  CONSTRAINT "quote_single_outcome" CHECK ("accepted_at" IS NULL OR "rejected_at" IS NULL),
  CONSTRAINT "quote_outcome_actor" CHECK (("accepted_at" IS NULL AND "accepted_by_type" IS NULL AND "accepted_by_id" IS NULL) OR ("accepted_at" IS NOT NULL AND "accepted_by_type" IN ('GUEST','CUSTOMER_ACCOUNT') AND "accepted_by_id" IS NOT NULL))
);
CREATE UNIQUE INDEX "quotes_tenant_id_id_key" ON "quotes"("tenant_id", "id");
CREATE UNIQUE INDEX "quotes_tenant_id_quote_group_id_version_key" ON "quotes"("tenant_id", "quote_group_id", "version");
CREATE INDEX "quotes_tenant_id_request_id_version_idx" ON "quotes"("tenant_id", "request_id", "version");
CREATE INDEX "quotes_tenant_id_quote_group_id_status_idx" ON "quotes"("tenant_id", "quote_group_id", "status");
-- docs 04 BR-QTE: at most one effective SENT offer and one open DRAFT per group.
CREATE UNIQUE INDEX "quotes_one_sent_per_group_key" ON "quotes"("tenant_id", "quote_group_id") WHERE "status" = 'SENT';
CREATE UNIQUE INDEX "quotes_one_draft_per_group_key" ON "quotes"("tenant_id", "quote_group_id") WHERE "status" = 'DRAFT';
CREATE TABLE "quote_revision_requests" (
  "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "quote_group_id" UUID NOT NULL, "quote_id" UUID NOT NULL,
  "message" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "requested_by_type" TEXT NOT NULL, "requested_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolved_at" TIMESTAMP(3), "resolved_by" UUID, "decline_reason" TEXT,
  CONSTRAINT "quote_revision_requests_tenant_id_quote_id_fkey" FOREIGN KEY ("tenant_id", "quote_id") REFERENCES "quotes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quote_revision_status_valid" CHECK ("status" IN ('PENDING','RESOLVED','DECLINED','WITHDRAWN')),
  CONSTRAINT "quote_revision_requested_by_valid" CHECK ("requested_by_type" IN ('GUEST','CUSTOMER_ACCOUNT'))
);
CREATE UNIQUE INDEX "quote_revision_requests_tenant_id_id_key" ON "quote_revision_requests"("tenant_id", "id");
CREATE INDEX "quote_revision_requests_tenant_id_quote_group_id_idx" ON "quote_revision_requests"("tenant_id", "quote_group_id");
CREATE INDEX "quote_revision_requests_tenant_id_quote_id_idx" ON "quote_revision_requests"("tenant_id", "quote_id");
-- docs 04 BR-QTE: at most one PENDING revision per quoteGroup.
CREATE UNIQUE INDEX "quote_revisions_one_pending_key" ON "quote_revision_requests"("tenant_id", "quote_group_id") WHERE "status" = 'PENDING';
CREATE TABLE "idempotency_keys" (
  "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "principal_id" TEXT NOT NULL, "key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL, "response_summary" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "idempotency_key_shape" CHECK ("key" <> '' AND "principal_id" <> '')
);
CREATE UNIQUE INDEX "idempotency_keys_tenant_id_principal_id_key_key" ON "idempotency_keys"("tenant_id", "principal_id", "key");
CREATE INDEX "idempotency_keys_tenant_id_expires_at_idx" ON "idempotency_keys"("tenant_id", "expires_at");
