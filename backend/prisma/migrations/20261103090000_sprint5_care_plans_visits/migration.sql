-- Sprint 5: care plans, versions, visits, visit tasks and assignment history.
-- Additive only; partial unique occurrence key and CHECK constraints are
-- added here because Prisma cannot express them (docs 06 invariants 3-5).

CREATE TABLE "care_plans" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "service_request_id" UUID,
    "agency_service_id" UUID NOT NULL,
    "primary_caregiver_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "care_plan_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "care_plan_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "valid_from" VARCHAR(10) NOT NULL,
    "valid_until" VARCHAR(10) NOT NULL,
    "weekdays_json" JSONB NOT NULL,
    "local_start_time" VARCHAR(5) NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "goal_text" TEXT,
    "task_templates_json" JSONB NOT NULL,
    "clinical_instructions_restricted" TEXT,
    "timezone_snapshot" TEXT NOT NULL,
    "dst_resolution" TEXT NOT NULL DEFAULT 'REJECT',
    "approved_by_staff_id" UUID,
    "approved_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_plan_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "visits" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "agency_service_id" UUID NOT NULL,
    "care_plan_id" UUID,
    "plan_version_id" UUID,
    "occurrence_key" VARCHAR(96),
    "assigned_caregiver_id" UUID,
    "area_id" TEXT NOT NULL,
    "service_name_snapshot" JSONB NOT NULL,
    "scheduled_start_utc" TIMESTAMP(3) NOT NULL,
    "scheduled_end_utc" TIMESTAMP(3) NOT NULL,
    "timezone_snapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "assignment_health" TEXT NOT NULL DEFAULT 'OK',
    "review_status" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "actual_start_at" TIMESTAMP(3),
    "actual_end_at" TIMESTAMP(3),
    "cancelled_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "visit_tasks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "description_snapshot" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "outcome" TEXT NOT NULL DEFAULT 'PENDING',
    "not_done_reason" TEXT,
    "done_at" TIMESTAMP(3),
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "visit_assignment_history" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "old_caregiver_id" UUID,
    "new_caregiver_id" UUID NOT NULL,
    "changed_by" UUID NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_assignment_history_pkey" PRIMARY KEY ("id")
);

-- Indexes (docs 06 item 7).
CREATE UNIQUE INDEX "care_plans_tenant_id_id_key" ON "care_plans"("tenant_id", "id");
CREATE INDEX "care_plans_tenant_id_status_idx" ON "care_plans"("tenant_id", "status");
CREATE INDEX "care_plans_tenant_id_patient_id_idx" ON "care_plans"("tenant_id", "patient_id");

CREATE UNIQUE INDEX "care_plan_versions_tenant_id_id_key" ON "care_plan_versions"("tenant_id", "id");
CREATE UNIQUE INDEX "care_plan_versions_tenant_id_care_plan_id_version_key" ON "care_plan_versions"("tenant_id", "care_plan_id", "version");

CREATE UNIQUE INDEX "visits_tenant_id_id_key" ON "visits"("tenant_id", "id");
CREATE INDEX "visits_tenant_id_assigned_caregiver_id_scheduled_start_utc__idx" ON "visits"("tenant_id", "assigned_caregiver_id", "scheduled_start_utc", "status");
CREATE INDEX "visits_tenant_id_patient_id_scheduled_start_utc_idx" ON "visits"("tenant_id", "patient_id", "scheduled_start_utc");
CREATE INDEX "visits_tenant_id_care_plan_id_idx" ON "visits"("tenant_id", "care_plan_id");
CREATE INDEX "visits_tenant_id_status_scheduled_start_utc_idx" ON "visits"("tenant_id", "status", "scheduled_start_utc");

CREATE UNIQUE INDEX "visit_tasks_tenant_id_id_key" ON "visit_tasks"("tenant_id", "id");
CREATE INDEX "visit_tasks_tenant_id_visit_id_idx" ON "visit_tasks"("tenant_id", "visit_id");

CREATE UNIQUE INDEX "visit_assignment_history_tenant_id_id_key" ON "visit_assignment_history"("tenant_id", "id");
CREATE INDEX "visit_assignment_history_tenant_id_visit_id_idx" ON "visit_assignment_history"("tenant_id", "visit_id");

-- Foreign keys (tenant-consistent composites where the parent carries them).
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_tenant_id_service_request_id_fkey" FOREIGN KEY ("tenant_id", "service_request_id") REFERENCES "service_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_tenant_id_agency_service_id_fkey" FOREIGN KEY ("tenant_id", "agency_service_id") REFERENCES "agency_services"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_tenant_id_primary_caregiver_id_fkey" FOREIGN KEY ("tenant_id", "primary_caregiver_id") REFERENCES "caregivers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "care_plan_versions" ADD CONSTRAINT "care_plan_versions_tenant_id_care_plan_id_fkey" FOREIGN KEY ("tenant_id", "care_plan_id") REFERENCES "care_plans"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "care_plan_versions" ADD CONSTRAINT "care_plan_versions_tenant_id_approved_by_staff_id_fkey" FOREIGN KEY ("tenant_id", "approved_by_staff_id") REFERENCES "staff_accounts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "visits" ADD CONSTRAINT "visits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visits" ADD CONSTRAINT "visits_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visits" ADD CONSTRAINT "visits_tenant_id_agency_service_id_fkey" FOREIGN KEY ("tenant_id", "agency_service_id") REFERENCES "agency_services"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visits" ADD CONSTRAINT "visits_tenant_id_care_plan_id_fkey" FOREIGN KEY ("tenant_id", "care_plan_id") REFERENCES "care_plans"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visits" ADD CONSTRAINT "visits_tenant_id_plan_version_id_fkey" FOREIGN KEY ("tenant_id", "plan_version_id") REFERENCES "care_plan_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visits" ADD CONSTRAINT "visits_tenant_id_assigned_caregiver_id_fkey" FOREIGN KEY ("tenant_id", "assigned_caregiver_id") REFERENCES "caregivers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "visit_tasks" ADD CONSTRAINT "visit_tasks_tenant_id_visit_id_fkey" FOREIGN KEY ("tenant_id", "visit_id") REFERENCES "visits"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "visit_assignment_history" ADD CONSTRAINT "visit_assignment_history_tenant_id_visit_id_fkey" FOREIGN KEY ("tenant_id", "visit_id") REFERENCES "visits"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Deterministic idempotent generation (docs 06 invariant 4): unique
-- occurrence key per tenant/plan where present.
CREATE UNIQUE INDEX "visits_tenant_id_care_plan_id_occurrence_key_key" ON "visits"("tenant_id", "care_plan_id", "occurrence_key") WHERE "occurrence_key" IS NOT NULL;

-- One open DRAFT version per plan (docs 04 BR-PLAN draft editing boundary).
CREATE UNIQUE INDEX "care_plan_versions_one_draft_per_plan_key" ON "care_plan_versions"("tenant_id", "care_plan_id") WHERE "status" = 'DRAFT';

-- Domain CHECKs (docs 06 invariant 5 and state shapes).
ALTER TABLE "visits" ADD CONSTRAINT "visits_scheduled_end_after_start" CHECK ("scheduled_end_utc" > "scheduled_start_utc");
ALTER TABLE "visits" ADD CONSTRAINT "visits_actual_end_requires_start" CHECK ("actual_end_at" IS NULL OR "actual_start_at" IS NOT NULL);
ALTER TABLE "visits" ADD CONSTRAINT "visits_status_allowed" CHECK ("status" IN ('PLANNED','SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED','MISSED'));
ALTER TABLE "visits" ADD CONSTRAINT "visits_assignment_health_allowed" CHECK ("assignment_health" IN ('OK','NEEDS_REASSIGNMENT'));
ALTER TABLE "visits" ADD CONSTRAINT "visits_positive_version" CHECK ("version" > 0);
ALTER TABLE "care_plan_versions" ADD CONSTRAINT "care_plan_versions_positive_version" CHECK ("version" > 0);
ALTER TABLE "care_plan_versions" ADD CONSTRAINT "care_plan_versions_status_allowed" CHECK ("status" IN ('DRAFT','APPROVED','ACTIVATED'));
ALTER TABLE "care_plan_versions" ADD CONSTRAINT "care_plan_versions_duration_bounds" CHECK ("duration_min" >= 15 AND "duration_min" <= 720);
ALTER TABLE "care_plan_versions" ADD CONSTRAINT "care_plan_versions_valid_range" CHECK ("valid_until" >= "valid_from");
ALTER TABLE "care_plans" ADD CONSTRAINT "care_plans_status_allowed" CHECK ("status" IN ('DRAFT','ACTIVE','PAUSED','COMPLETED','CANCELLED'));
ALTER TABLE "visit_tasks" ADD CONSTRAINT "visit_tasks_outcome_allowed" CHECK ("outcome" IN ('PENDING','DONE','NOT_DONE'));
ALTER TABLE "visit_assignment_history" ADD CONSTRAINT "visit_assignment_history_reassignment" CHECK ("old_caregiver_id" IS NULL OR "old_caregiver_id" <> "new_caregiver_id");
