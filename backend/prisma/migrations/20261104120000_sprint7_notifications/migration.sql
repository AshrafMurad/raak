-- Additive only; existing applied migration files remain unchanged.
ALTER TABLE tenants ADD COLUMN notification_settings_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE notification_policies (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE, event_type TEXT NOT NULL,
  channel TEXT NOT NULL, enabled BOOLEAN NOT NULL, reminder_offset_min INTEGER,
  updated_by UUID NOT NULL, updated_at TIMESTAMP(3) NOT NULL,
  PRIMARY KEY (tenant_id, event_type, channel),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES staff_accounts(tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (channel IN ('IN_APP','EMAIL')),
  CHECK (reminder_offset_min IS NULL OR (event_type = 'VISIT_REMINDER' AND reminder_offset_min BETWEEN 1 AND 10080))
);
CREATE TABLE notification_preferences (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE, principal_type principal_type NOT NULL,
  principal_id UUID NOT NULL, event_type TEXT NOT NULL, channel TEXT NOT NULL,
  opted_out BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMP(3) NOT NULL,
  PRIMARY KEY (tenant_id, principal_type, principal_id, event_type, channel),
  CHECK (principal_type IN ('AGENCY_STAFF','AGENCY_CUSTOMER')),
  CHECK (channel IN ('IN_APP','EMAIL'))
);
CREATE TABLE notifications (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL, event_id UUID NOT NULL,
  principal_type principal_type NOT NULL, recipient_principal_id UUID NOT NULL,
  event_type TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id UUID NOT NULL,
  read_at TIMESTAMP(3), created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id, event_id) REFERENCES outbox_events(tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (principal_type IN ('AGENCY_STAFF','AGENCY_CUSTOMER'))
);
CREATE UNIQUE INDEX notifications_tenant_id_event_id_principal_type_recipient_p_key
  ON notifications(tenant_id,event_id,principal_type,recipient_principal_id);
CREATE INDEX notifications_tenant_id_recipient_principal_id_read_at_crea_idx
  ON notifications(tenant_id,recipient_principal_id,read_at,created_at);
CREATE TABLE notification_deliveries (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL, event_id UUID NOT NULL,
  principal_type principal_type NOT NULL, recipient_principal_id UUID NOT NULL,
  event_type TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'EMAIL',
  status TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0,
  retry_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, lease_until TIMESTAMP(3),
  execution_token UUID, last_error_code TEXT, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id,event_id) REFERENCES outbox_events(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (channel = 'EMAIL'), CHECK (attempts BETWEEN 0 AND 5),
  CHECK (principal_type IN ('AGENCY_STAFF','AGENCY_CUSTOMER')),
  CHECK (status IN ('PENDING','SENDING','SENT','FAILED','SKIPPED')),
  CHECK ((status = 'SENDING') = (lease_until IS NOT NULL AND execution_token IS NOT NULL))
);
CREATE UNIQUE INDEX notification_deliveries_tenant_id_event_id_principal_type_r_key
  ON notification_deliveries(tenant_id,event_id,principal_type,recipient_principal_id,channel);
CREATE INDEX notification_deliveries_tenant_id_status_retry_at_idx
  ON notification_deliveries(tenant_id,status,retry_at);
