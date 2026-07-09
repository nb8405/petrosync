ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS audit_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id BIGINT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS user_role TEXT,
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS old_value JSONB,
  ADD COLUMN IF NOT EXISTS new_value JSONB,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS machine_name TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT;

UPDATE audit_logs
SET audit_id = CONCAT('AUD-', id)
WHERE audit_id IS NULL;

ALTER TABLE audit_logs
  ALTER COLUMN audit_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_logs_audit_id
  ON audit_logs (audit_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON audit_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation
  ON audit_logs (correlation_id)
  WHERE correlation_id IS NOT NULL;

ALTER TABLE backup_schedule_config
  ADD COLUMN IF NOT EXISTS backup_mode TEXT NOT NULL DEFAULT 'full'
  CHECK (backup_mode IN ('full', 'incremental'));

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_audit_log_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'audit_logs are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_update ON audit_logs;
CREATE TRIGGER trg_prevent_audit_log_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS trg_prevent_audit_log_delete ON audit_logs;
CREATE TRIGGER trg_prevent_audit_log_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();
