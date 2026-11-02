-- A scan is reserved before provider I/O. Duplicate finalizers cannot race
-- CLEAN against a different verdict; abandoned reservations fail closed.
ALTER TABLE "documents" ADD COLUMN "scan_started_at" TIMESTAMP(3);
