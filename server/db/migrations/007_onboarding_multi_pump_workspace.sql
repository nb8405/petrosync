DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname
  INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'app_users'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%ReadOnly%'
    AND pg_get_constraintdef(oid) LIKE '%Operator%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE app_users DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE app_users
  ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('Owner', 'Manager', 'Accountant', 'Supervisor', 'Operator', 'Auditor', 'ReadOnly'));

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS recovery_email TEXT,
  ADD COLUMN IF NOT EXISTS recovery_phone TEXT,
  ADD COLUMN IF NOT EXISTS security_question TEXT,
  ADD COLUMN IF NOT EXISTS security_answer_hash TEXT;

CREATE TABLE IF NOT EXISTS pump_workspaces (
  id BIGSERIAL PRIMARY KEY,
  pump_name TEXT NOT NULL,
  dealer_name TEXT NOT NULL,
  company TEXT NOT NULL,
  state TEXT NOT NULL,
  district TEXT NOT NULL,
  address TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  email TEXT NOT NULL,
  logo_data_url TEXT,
  theme_key TEXT NOT NULL DEFAULT 'indianOil',
  financial_year TEXT,
  gst_configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  tax_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  currency TEXT NOT NULL DEFAULT 'INR',
  language TEXT NOT NULL DEFAULT 'English',
  date_format TEXT NOT NULL DEFAULT 'DD-MM-YYYY',
  backup_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  products JSONB NOT NULL DEFAULT '[]'::jsonb,
  staff_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  integrations JSONB NOT NULL DEFAULT '{}'::jsonb,
  health_check JSONB NOT NULL DEFAULT '{}'::jsonb,
  launched_at TIMESTAMPTZ,
  created_by BIGINT REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pump_workspaces_created_at
  ON pump_workspaces (created_at DESC);

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname
  INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'forecourt_pumps'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%Tokheim%'
    AND pg_get_constraintdef(oid) LIKE '%manufacturer%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE forecourt_pumps DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE forecourt_pumps
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS automation_id TEXT,
  ADD COLUMN IF NOT EXISTS atg_id TEXT,
  ADD COLUMN IF NOT EXISTS atos_id TEXT;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname
  INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'forecourt_tanks'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%XP95%'
    AND pg_get_constraintdef(oid) LIKE '%product_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE forecourt_tanks DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname
  INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'forecourt_nozzles'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%XP95%'
    AND pg_get_constraintdef(oid) LIKE '%product_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE forecourt_nozzles DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE forecourt_tanks
  ADD COLUMN IF NOT EXISTS automation_id TEXT,
  ADD COLUMN IF NOT EXISTS atg_id TEXT,
  ADD COLUMN IF NOT EXISTS atos_id TEXT;

ALTER TABLE forecourt_nozzles
  ADD COLUMN IF NOT EXISTS tank_id BIGINT REFERENCES forecourt_tanks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS automation_id TEXT,
  ADD COLUMN IF NOT EXISTS atg_id TEXT,
  ADD COLUMN IF NOT EXISTS atos_id TEXT;

CREATE INDEX IF NOT EXISTS idx_forecourt_nozzles_tank
  ON forecourt_nozzles (tank_id);
