-- CreateEnum
CREATE TYPE "principal_type" AS ENUM ('PLATFORM_OPERATOR', 'AGENCY_STAFF', 'AGENCY_CUSTOMER');

-- CreateEnum
CREATE TYPE "staff_role" AS ENUM ('AGENCY_OWNER', 'AGENCY_ADMIN', 'CARE_COORDINATOR', 'CAREGIVER');

-- CreateEnum
CREATE TYPE "account_status" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "email_token_purpose" AS ENUM ('OWNER_VERIFICATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "platform_operators" (
    "id" UUID NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "account_status" NOT NULL DEFAULT 'ACTIVE',
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "staff_role" NOT NULL,
    "status" "account_status" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "email_verified_at" TIMESTAMP(3),
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "account_status" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "email_verified_at" TIMESTAMP(3),
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_invitations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "role" "staff_role" NOT NULL,
    "caregiver_profile_json" JSONB,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_by_staff_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "principal_type" "principal_type" NOT NULL,
    "principal_id" UUID NOT NULL,
    "tenant_id" UUID,
    "secret_hash" TEXT NOT NULL,
    "csrf_token_hash" TEXT NOT NULL,
    "session_version" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "purpose" "email_token_purpose" NOT NULL,
    "principal_type" "principal_type" NOT NULL,
    "principal_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "actor_type" "principal_type",
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID,
    "reason" TEXT,
    "metadata_json" JSONB NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caregivers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "staff_account_id" UUID,
    "name" TEXT NOT NULL,
    "professional_category" TEXT NOT NULL,
    "operational_status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "service_areas_json" JSONB NOT NULL DEFAULT '[]',
    "qualification_verification_status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caregivers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_operators_email_normalized_key" ON "platform_operators"("email_normalized");

-- CreateIndex
CREATE INDEX "staff_accounts_tenant_id_idx" ON "staff_accounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_accounts_tenant_id_email_normalized_key" ON "staff_accounts"("tenant_id", "email_normalized");

-- CreateIndex
CREATE INDEX "customer_accounts_tenant_id_idx" ON "customer_accounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_accounts_tenant_id_email_normalized_key" ON "customer_accounts"("tenant_id", "email_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invitations_token_hash_key" ON "staff_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "staff_invitations_tenant_id_email_normalized_idx" ON "staff_invitations"("tenant_id", "email_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_secret_hash_key" ON "auth_sessions"("secret_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_principal_id_idx" ON "auth_sessions"("principal_id");

-- CreateIndex
CREATE INDEX "auth_sessions_tenant_id_idx" ON "auth_sessions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_tokens_token_hash_key" ON "email_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_tokens_principal_id_purpose_idx" ON "email_tokens"("principal_id", "purpose");

-- CreateIndex
CREATE INDEX "audit_events_tenant_id_at_idx" ON "audit_events"("tenant_id", "at");

-- CreateIndex
CREATE INDEX "audit_events_action_at_idx" ON "audit_events"("action", "at");

-- CreateIndex
CREATE UNIQUE INDEX "caregivers_staff_account_id_key" ON "caregivers"("staff_account_id");

-- CreateIndex
CREATE INDEX "caregivers_tenant_id_idx" ON "caregivers"("tenant_id");

-- AddForeignKey
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_accounts" ADD CONSTRAINT "customer_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "staff_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregivers" ADD CONSTRAINT "caregivers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caregivers" ADD CONSTRAINT "caregivers_staff_account_id_fkey" FOREIGN KEY ("staff_account_id") REFERENCES "staff_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
