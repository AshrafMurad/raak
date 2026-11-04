-- Sprint 6 — visit execution and customer change requests (docs 04 BR-VST/BR-CHG, docs 06).
-- Additive only: tenant change-policy columns, visit notes, visit change requests.

ALTER TABLE "tenants"
  ADD COLUMN "change_cancel_cutoff_hours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "change_reschedule_cutoff_hours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "allow_late_review" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "settings_version" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "visit_notes" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "visit_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "body_restricted" TEXT NOT NULL,
  "is_draft" BOOLEAN NOT NULL DEFAULT true,
  "is_addendum" BOOLEAN NOT NULL DEFAULT false,
  "parent_note_id" UUID,
  "reason" TEXT,
  "finalized_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "visit_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "visit_notes_tenant_id_id_key" ON "visit_notes"("tenant_id", "id");
CREATE INDEX "visit_notes_tenant_id_visit_id_idx" ON "visit_notes"("tenant_id", "visit_id");

ALTER TABLE "visit_notes"
  ADD CONSTRAINT "visit_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "visit_notes_visit_id_fkey" FOREIGN KEY ("tenant_id", "visit_id") REFERENCES "visits"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "visit_notes_parent_note_id_fkey" FOREIGN KEY ("tenant_id", "parent_note_id") REFERENCES "visit_notes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One editable draft per visit: enforced by the service inside the visit
-- lock; finalized/addendum rows are append-only history.

CREATE TABLE "visit_change_requests" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "visit_id" UUID NOT NULL,
  "requester_account_id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "urgency" TEXT NOT NULL DEFAULT 'NORMAL',
  "proposed_start_utc" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  "policy_snapshot_json" JSONB NOT NULL,
  "decision_by_staff_id" UUID,
  "decision_at" TIMESTAMP(3),
  "decision_reason" TEXT,
  "withdrawn_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "visit_change_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "visit_change_requests_type_check" CHECK ("type" IN ('CANCEL', 'RESCHEDULE')),
  CONSTRAINT "visit_change_requests_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
  CONSTRAINT "visit_change_requests_urgency_check" CHECK ("urgency" IN ('NORMAL', 'LATE')),
  CONSTRAINT "visit_change_requests_proposed_check" CHECK ("type" <> 'RESCHEDULE' OR "proposed_start_utc" IS NOT NULL)
);

CREATE UNIQUE INDEX "visit_change_requests_tenant_id_id_key" ON "visit_change_requests"("tenant_id", "id");
CREATE INDEX "visit_change_requests_tenant_id_status_urgency_idx" ON "visit_change_requests"("tenant_id", "status", "urgency");
CREATE INDEX "visit_change_requests_tenant_id_visit_id_idx" ON "visit_change_requests"("tenant_id", "visit_id");

-- docs 04 BR-CHG / docs 06 invariant 3: one PENDING request per visit.
CREATE UNIQUE INDEX "visit_change_requests_one_pending_per_visit"
  ON "visit_change_requests"("tenant_id", "visit_id")
  WHERE "status" = 'PENDING';

ALTER TABLE "visit_change_requests"
  ADD CONSTRAINT "visit_change_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "visit_change_requests_visit_id_fkey" FOREIGN KEY ("tenant_id", "visit_id") REFERENCES "visits"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "visit_change_requests_requester_fkey" FOREIGN KEY ("tenant_id", "requester_account_id") REFERENCES "customer_accounts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "visit_change_requests_decision_by_fkey" FOREIGN KEY ("tenant_id", "decision_by_staff_id") REFERENCES "staff_accounts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
