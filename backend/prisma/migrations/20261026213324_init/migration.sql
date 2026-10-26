-- CreateEnum
CREATE TYPE "tenant_status" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "tenant_status" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "timezone" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "travel_buffer_min" INTEGER NOT NULL DEFAULT 30,
    "support_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "event_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload_minimal" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "outbox_events_processed_at_created_at_idx" ON "outbox_events"("processed_at", "created_at");
