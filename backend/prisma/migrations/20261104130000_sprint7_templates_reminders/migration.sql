ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS notification_locale TEXT NOT NULL DEFAULT 'ar'
  CHECK (notification_locale IN ('ar','en'));
ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS notification_locale TEXT NOT NULL DEFAULT 'ar'
  CHECK (notification_locale IN ('ar','en'));
ALTER TABLE visits ADD COLUMN IF NOT EXISTS reminder_revision INTEGER NOT NULL DEFAULT 0 CHECK (reminder_revision >= 0);
ALTER TABLE notification_deliveries DROP CONSTRAINT notification_deliveries_principal_type_check;
ALTER TABLE notification_deliveries ALTER COLUMN principal_type TYPE TEXT USING principal_type::text;
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_delivery_principal
  CHECK (principal_type IN ('AGENCY_STAFF','AGENCY_CUSTOMER','VERIFIED_GUEST'));
CREATE TABLE visit_reminders (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL, visit_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0), channel TEXT NOT NULL CHECK (channel IN ('IN_APP','EMAIL')),
  offset_min INTEGER NOT NULL CHECK (offset_min BETWEEN 1 AND 10080),
  due_at TIMESTAMP(3) NOT NULL, scheduled_start_utc TIMESTAMP(3) NOT NULL,
  CONSTRAINT reminder_window CHECK (due_at < scheduled_start_utc),
  CONSTRAINT visit_reminders_tenant_id_visit_id_fkey FOREIGN KEY (tenant_id,visit_id) REFERENCES visits(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX visit_reminders_tenant_id_visit_id_revision_channel_offset_min_key
  ON visit_reminders(tenant_id,visit_id,revision,channel,offset_min);
CREATE INDEX visit_reminders_tenant_id_due_at_idx ON visit_reminders(tenant_id,due_at);
