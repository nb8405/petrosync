CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_audit_log_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'audit_logs are immutable';
END;
$$ LANGUAGE plpgsql;
