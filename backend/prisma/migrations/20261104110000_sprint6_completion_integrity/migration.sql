-- Additive integrity hardening; no applied migration is rewritten.
ALTER TABLE visits ADD COLUMN completion_snapshot_json JSONB;
CREATE TABLE visit_reviews (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  visit_id UUID NOT NULL,
  reviewer_id UUID NOT NULL,
  note_restricted TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT visit_reviews_tenant_id_visit_id_fkey FOREIGN KEY(tenant_id, visit_id) REFERENCES visits(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT visit_reviews_tenant_id_reviewer_id_fkey FOREIGN KEY(tenant_id, reviewer_id) REFERENCES staff_accounts(tenant_id,id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX visit_reviews_tenant_id_visit_id_key ON visit_reviews(tenant_id, visit_id);
ALTER TABLE visit_notes ADD CONSTRAINT visit_notes_author_fkey
  FOREIGN KEY (tenant_id, author_id) REFERENCES staff_accounts(tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX visit_notes_one_draft ON visit_notes(tenant_id, visit_id, author_id) WHERE is_draft;
ALTER TABLE tenants ADD CONSTRAINT scheduling_policy_bounds CHECK
  (settings_version >= 0 AND travel_buffer_min BETWEEN 0 AND 120 AND change_cancel_cutoff_hours BETWEEN 0 AND 168 AND change_reschedule_cutoff_hours BETWEEN 0 AND 168);
ALTER TABLE visit_notes ADD CONSTRAINT visit_note_shape CHECK
  (length(body_restricted) BETWEEN 1 AND 5000 AND (is_draft = (finalized_at IS NULL)) AND
   (NOT is_addendum OR (NOT is_draft AND reason IS NOT NULL AND length(trim(reason)) >= 5)));

CREATE FUNCTION raak_protect_final_note() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT OLD.is_draft THEN RAISE EXCEPTION 'Finalized visit documentation is immutable'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER visit_note_immutable BEFORE UPDATE ON visit_notes FOR EACH ROW EXECUTE FUNCTION raak_protect_final_note();

CREATE FUNCTION raak_protect_completed_visit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'COMPLETED' AND
    (to_jsonb(NEW) - ARRAY['review_status','version','updated_at']) IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['review_status','version','updated_at']) THEN
      RAISE EXCEPTION 'Completed visit execution is immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER visit_completion_immutable BEFORE UPDATE ON visits FOR EACH ROW EXECUTE FUNCTION raak_protect_completed_visit();

CREATE FUNCTION raak_protect_completed_task() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM visits WHERE tenant_id = OLD.tenant_id AND id = OLD.visit_id AND status = 'COMPLETED') THEN
    RAISE EXCEPTION 'Completed visit tasks are immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER visit_task_immutable BEFORE UPDATE ON visit_tasks FOR EACH ROW EXECUTE FUNCTION raak_protect_completed_task();
