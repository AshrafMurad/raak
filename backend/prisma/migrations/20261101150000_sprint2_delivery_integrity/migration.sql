CREATE UNIQUE INDEX "staff_accounts_tenant_id_id_key" ON "staff_accounts"("tenant_id", "id");
CREATE UNIQUE INDEX "outbox_events_tenant_id_id_key" ON "outbox_events"("tenant_id", "id");
ALTER TABLE "request_notifications" ADD CONSTRAINT "request_notifications_tenant_id_staff_id_fkey"
FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff_accounts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_tenant_id_event_id_fkey"
FOREIGN KEY ("tenant_id", "event_id") REFERENCES "outbox_events"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
