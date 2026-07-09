CREATE TABLE IF NOT EXISTS dsr_records (
  id BIGSERIAL PRIMARY KEY,
  dsr_number TEXT UNIQUE,
  dsr_date DATE NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dsr_product_rows (
  id BIGSERIAL PRIMARY KEY,
  dsr_record_id BIGINT NOT NULL REFERENCES dsr_records(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  product_label TEXT NOT NULL,
  opening_reading NUMERIC(14, 3) NOT NULL DEFAULT 0,
  closing_reading NUMERIC(14, 3) NOT NULL DEFAULT 0,
  testing_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
  receipt_qty NUMERIC(14, 3) NOT NULL DEFAULT 0,
  tank_dip NUMERIC(14, 3) NOT NULL DEFAULT 0,
  water_dip NUMERIC(14, 3) NOT NULL DEFAULT 0,
  sales_liters NUMERIC(14, 3) NOT NULL DEFAULT 0,
  rate NUMERIC(14, 3) NOT NULL DEFAULT 0,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  closing_stock NUMERIC(14, 3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dsr_record_id, product_code),
  CHECK (opening_reading >= 0),
  CHECK (closing_reading >= 0),
  CHECK (testing_qty >= 0),
  CHECK (receipt_qty >= 0),
  CHECK (tank_dip >= 0),
  CHECK (water_dip >= 0),
  CHECK (sales_liters >= 0),
  CHECK (rate >= 0),
  CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS dsr_collections (
  id BIGSERIAL PRIMARY KEY,
  dsr_record_id BIGINT NOT NULL REFERENCES dsr_records(id) ON DELETE CASCADE,
  collection_type TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  UNIQUE (dsr_record_id, collection_type),
  CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS dsr_expenses (
  id BIGSERIAL PRIMARY KEY,
  dsr_record_id BIGINT NOT NULL REFERENCES dsr_records(id) ON DELETE CASCADE,
  expense_type TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  UNIQUE (dsr_record_id, expense_type),
  CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_dsr_records_dsr_date
  ON dsr_records (dsr_date);

CREATE INDEX IF NOT EXISTS idx_dsr_product_rows_product_code
  ON dsr_product_rows (product_code);

CREATE INDEX IF NOT EXISTS idx_dsr_product_rows_record_product
  ON dsr_product_rows (dsr_record_id, product_code);

CREATE INDEX IF NOT EXISTS idx_dsr_collections_record_type
  ON dsr_collections (dsr_record_id, collection_type);

CREATE INDEX IF NOT EXISTS idx_dsr_expenses_record_type
  ON dsr_expenses (dsr_record_id, expense_type);

CREATE TABLE IF NOT EXISTS numbering_sequences (
  sequence_key TEXT PRIMARY KEY,
  prefix TEXT NOT NULL,
  current_value BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backup_history (
  id BIGSERIAL PRIMARY KEY,
  backup_number TEXT NOT NULL UNIQUE,
  backup_type TEXT NOT NULL,
  status TEXT NOT NULL,
  file_path TEXT,
  file_name TEXT,
  backup_size_bytes BIGINT NOT NULL DEFAULT 0,
  checksum TEXT,
  created_by BIGINT,
  metadata_encrypted TEXT,
  verified_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS restore_history (
  id BIGSERIAL PRIMARY KEY,
  restore_number TEXT NOT NULL UNIQUE,
  backup_id BIGINT REFERENCES backup_history(id),
  status TEXT NOT NULL,
  message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS export_history (
  id BIGSERIAL PRIMARY KEY,
  export_reference TEXT NOT NULL UNIQUE,
  export_type TEXT NOT NULL,
  report_type TEXT NOT NULL,
  product_key TEXT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  status TEXT NOT NULL,
  file_path TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_history (
  id BIGSERIAL PRIMARY KEY,
  report_number TEXT NOT NULL UNIQUE,
  report_type TEXT NOT NULL,
  product_key TEXT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS print_history (
  id BIGSERIAL PRIMARY KEY,
  print_reference TEXT NOT NULL UNIQUE,
  report_type TEXT NOT NULL,
  product_key TEXT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  audit_id TEXT UNIQUE,
  action_type TEXT NOT NULL,
  action TEXT,
  module_name TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  user_id BIGINT,
  username TEXT,
  user_role TEXT,
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  machine_name TEXT,
  request_id TEXT,
  correlation_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGSERIAL PRIMARY KEY,
  activity_type TEXT NOT NULL,
  module_name TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_history_started_at
  ON backup_history (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_backup_history_status_started
  ON backup_history (status, started_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_backup_history_checksum
  ON backup_history (checksum)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_restore_history_started_at
  ON restore_history (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_export_history_created_at
  ON export_history (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_history_created_at
  ON report_history (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_print_history_created_at
  ON print_history (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_module_action
  ON audit_logs (module_name, action_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_logs_audit_id
  ON audit_logs (audit_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
  ON audit_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation
  ON audit_logs (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
  ON activity_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_type_status
  ON activity_logs (activity_type, status);

CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
    CONSTRAINT app_users_password_hash_argon2id
    CHECK (password_hash LIKE '$argon2id$%'),
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Owner', 'Manager', 'Accountant', 'Supervisor', 'Operator', 'Auditor', 'ReadOnly')),
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  recovery_email TEXT,
  recovery_phone TEXT,
  security_question TEXT,
  security_answer_hash TEXT
    CONSTRAINT app_users_security_answer_hash_argon2id
    CHECK (security_answer_hash IS NULL OR security_answer_hash LIKE '$argon2id$%'),
  active BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS fuel_companies (
  id BIGSERIAL PRIMARY KEY,
  company_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fuel_master_products (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES fuel_companies(id) ON DELETE CASCADE,
  fuel_code TEXT NOT NULL,
  fuel_name TEXT NOT NULL,
  default_enabled BOOLEAN NOT NULL DEFAULT true,
  custom BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, fuel_code)
);

CREATE TABLE IF NOT EXISTS workspace_fuels (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES pump_workspaces(id) ON DELETE CASCADE,
  company_id BIGINT REFERENCES fuel_companies(id),
  fuel_master_product_id BIGINT REFERENCES fuel_master_products(id) ON DELETE SET NULL,
  fuel_code TEXT NOT NULL,
  fuel_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  custom BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, fuel_code)
);

CREATE INDEX IF NOT EXISTS idx_fuel_master_products_company
  ON fuel_master_products (company_id, active, sort_order);

CREATE INDEX IF NOT EXISTS idx_workspace_fuels_workspace
  ON workspace_fuels (workspace_id, enabled, sort_order);

INSERT INTO fuel_companies (company_key, display_name)
VALUES
  ('indianoil', 'IndianOil'),
  ('bpcl', 'Bharat Petroleum (BPCL)'),
  ('hpcl', 'Hindustan Petroleum (HPCL)'),
  ('shell', 'Shell'),
  ('nayara', 'Nayara Energy'),
  ('jiobp', 'Jio-bp'),
  ('custom', 'Other (Custom)')
ON CONFLICT (company_key)
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  active = true,
  updated_at = NOW();

WITH company AS (
  SELECT id FROM fuel_companies WHERE company_key = 'indianoil'
)
INSERT INTO fuel_master_products (company_id, fuel_code, fuel_name, sort_order)
SELECT company.id, product.fuel_code, product.fuel_name, product.sort_order
FROM company
CROSS JOIN (
  VALUES
    ('MS', 'MS', 10),
    ('XP95', 'XP95', 20),
    ('XP100', 'XP100', 30),
    ('HSD', 'HSD', 40),
    ('XTRAGREEN_DIESEL', 'XtraGreen Diesel', 50),
    ('CNG', 'CNG', 60),
    ('AUTO_LPG', 'Auto LPG', 70)
) AS product(fuel_code, fuel_name, sort_order)
ON CONFLICT (company_id, fuel_code)
DO UPDATE SET
  fuel_name = EXCLUDED.fuel_name,
  default_enabled = true,
  active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

WITH company AS (
  SELECT id FROM fuel_companies WHERE company_key = 'bpcl'
)
INSERT INTO fuel_master_products (company_id, fuel_code, fuel_name, sort_order)
SELECT company.id, product.fuel_code, product.fuel_name, product.sort_order
FROM company
CROSS JOIN (
  VALUES
    ('MS', 'MS', 10),
    ('SPEED_PETROL', 'Speed Petrol', 20),
    ('HSD', 'HSD', 30),
    ('PREMIUM_DIESEL', 'Premium Diesel', 40),
    ('CNG', 'CNG', 50),
    ('AUTO_LPG', 'Auto LPG', 60)
) AS product(fuel_code, fuel_name, sort_order)
ON CONFLICT (company_id, fuel_code)
DO UPDATE SET
  fuel_name = EXCLUDED.fuel_name,
  default_enabled = true,
  active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

WITH company AS (
  SELECT id FROM fuel_companies WHERE company_key = 'hpcl'
)
INSERT INTO fuel_master_products (company_id, fuel_code, fuel_name, sort_order)
SELECT company.id, product.fuel_code, product.fuel_name, product.sort_order
FROM company
CROSS JOIN (
  VALUES
    ('MS', 'MS', 10),
    ('POWER95', 'Power95', 20),
    ('HSD', 'HSD', 30),
    ('TURBOJET_DIESEL', 'TurboJet Diesel', 40),
    ('CNG', 'CNG', 50),
    ('AUTO_LPG', 'Auto LPG', 60)
) AS product(fuel_code, fuel_name, sort_order)
ON CONFLICT (company_id, fuel_code)
DO UPDATE SET
  fuel_name = EXCLUDED.fuel_name,
  default_enabled = true,
  active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

WITH company AS (
  SELECT id FROM fuel_companies WHERE company_key = 'shell'
)
INSERT INTO fuel_master_products (company_id, fuel_code, fuel_name, sort_order)
SELECT company.id, product.fuel_code, product.fuel_name, product.sort_order
FROM company
CROSS JOIN (
  VALUES
    ('SHELL_UNLEADED', 'Shell Unleaded', 10),
    ('SHELL_V_POWER_PETROL', 'Shell V-Power Petrol', 20),
    ('SHELL_DIESEL', 'Shell Diesel', 30),
    ('SHELL_V_POWER_DIESEL', 'Shell V-Power Diesel', 40)
) AS product(fuel_code, fuel_name, sort_order)
ON CONFLICT (company_id, fuel_code)
DO UPDATE SET
  fuel_name = EXCLUDED.fuel_name,
  default_enabled = true,
  active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

WITH company AS (
  SELECT id FROM fuel_companies WHERE company_key = 'nayara'
)
INSERT INTO fuel_master_products (company_id, fuel_code, fuel_name, sort_order)
SELECT company.id, product.fuel_code, product.fuel_name, product.sort_order
FROM company
CROSS JOIN (
  VALUES
    ('PETROL', 'Petrol', 10),
    ('DIESEL', 'Diesel', 20),
    ('PREMIUM_PETROL', 'Premium Petrol', 30)
) AS product(fuel_code, fuel_name, sort_order)
ON CONFLICT (company_id, fuel_code)
DO UPDATE SET
  fuel_name = EXCLUDED.fuel_name,
  default_enabled = true,
  active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

WITH company AS (
  SELECT id FROM fuel_companies WHERE company_key = 'jiobp'
)
INSERT INTO fuel_master_products (company_id, fuel_code, fuel_name, sort_order)
SELECT company.id, product.fuel_code, product.fuel_name, product.sort_order
FROM company
CROSS JOIN (
  VALUES
    ('PETROL', 'Petrol', 10),
    ('DIESEL', 'Diesel', 20),
    ('CNG', 'CNG', 30)
) AS product(fuel_code, fuel_name, sort_order)
ON CONFLICT (company_id, fuel_code)
DO UPDATE SET
  fuel_name = EXCLUDED.fuel_name,
  default_enabled = true,
  active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ,
  csrf_token_hash TEXT,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_address TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restore_approvals (
  id BIGSERIAL PRIMARY KEY,
  restore_number TEXT NOT NULL UNIQUE,
  backup_file_name TEXT NOT NULL,
  backup_signature TEXT NOT NULL,
  requested_by BIGINT REFERENCES app_users(id),
  approved_by BIGINT REFERENCES app_users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed', 'rejected', 'failed')),
  preview JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  message TEXT
);

CREATE INDEX IF NOT EXISTS idx_app_users_role
  ON app_users (role);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active
  ON user_sessions (user_id, revoked_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_active
  ON user_sessions (refresh_token_hash, revoked_at, refresh_expires_at);

CREATE TABLE IF NOT EXISTS backup_schedule_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT false,
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  backup_mode TEXT NOT NULL DEFAULT 'full' CHECK (backup_mode IN ('full', 'incremental')),
  run_time TEXT NOT NULL DEFAULT '02:00',
  retention_count INTEGER NOT NULL DEFAULT 7 CHECK (retention_count >= 1),
  updated_by BIGINT REFERENCES app_users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO backup_schedule_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_restore_approvals_status
  ON restore_approvals (status, requested_at DESC);

CREATE TABLE IF NOT EXISTS device_tanks (
  id BIGSERIAL PRIMARY KEY,
  tank_id TEXT NOT NULL UNIQUE,
  product_type TEXT NOT NULL,
  tank_name TEXT NOT NULL,
  capacity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  current_volume NUMERIC(14, 3) NOT NULL DEFAULT 0,
  water_level NUMERIC(14, 3) NOT NULL DEFAULT 0,
  temperature NUMERIC(8, 3),
  last_sync_time TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_nozzles (
  id BIGSERIAL PRIMARY KEY,
  nozzle_id TEXT NOT NULL UNIQUE,
  product_type TEXT NOT NULL,
  dispenser_id TEXT NOT NULL,
  totalizer_reading NUMERIC(14, 3) NOT NULL DEFAULT 0,
  last_reading NUMERIC(14, 3) NOT NULL DEFAULT 0,
  last_sync_time TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_mappings (
  id BIGSERIAL PRIMARY KEY,
  vendor_name TEXT NOT NULL,
  vendor_entity_type TEXT NOT NULL,
  vendor_entity_id TEXT NOT NULL,
  app_entity_type TEXT NOT NULL,
  app_entity_id TEXT NOT NULL,
  product_type TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_name, vendor_entity_type, vendor_entity_id)
);

CREATE TABLE IF NOT EXISTS device_sync_history (
  id BIGSERIAL PRIMARY KEY,
  vendor_name TEXT NOT NULL,
  status TEXT NOT NULL,
  tanks_synced INTEGER NOT NULL DEFAULT 0,
  nozzles_synced INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_device_tanks_product_type
  ON device_tanks (product_type);

CREATE INDEX IF NOT EXISTS idx_device_nozzles_product_type
  ON device_nozzles (product_type);

CREATE INDEX IF NOT EXISTS idx_device_mappings_vendor
  ON device_mappings (vendor_name, vendor_entity_type);

CREATE INDEX IF NOT EXISTS idx_device_sync_history_started_at
  ON device_sync_history (started_at DESC);

CREATE TABLE IF NOT EXISTS automation_connections (
  id BIGSERIAL PRIMARY KEY,
  vendor TEXT NOT NULL,
  connection_type TEXT NOT NULL DEFAULT 'tcp',
  ip_address TEXT NOT NULL,
  port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
  username TEXT,
  password_encrypted TEXT,
  sync_interval_minutes INTEGER NOT NULL DEFAULT 15 CHECK (sync_interval_minutes >= 1),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (vendor IN ('atos', 'doms', 'veederroot', 'generic'))
);

CREATE TABLE IF NOT EXISTS automation_tank_mappings (
  id BIGSERIAL PRIMARY KEY,
  connection_id BIGINT NOT NULL REFERENCES automation_connections(id) ON DELETE CASCADE,
  external_tank_id TEXT NOT NULL,
  external_tank_name TEXT,
  internal_tank_id TEXT NOT NULL,
  product_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, external_tank_id)
);

CREATE TABLE IF NOT EXISTS automation_nozzle_mappings (
  id BIGSERIAL PRIMARY KEY,
  connection_id BIGINT NOT NULL REFERENCES automation_connections(id) ON DELETE CASCADE,
  external_nozzle_id TEXT NOT NULL,
  external_nozzle_name TEXT,
  internal_nozzle_id TEXT NOT NULL,
  product_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, external_nozzle_id)
);

CREATE TABLE IF NOT EXISTS automation_sync_logs (
  id BIGSERIAL PRIMARY KEY,
  connection_id BIGINT REFERENCES automation_connections(id) ON DELETE SET NULL,
  sync_type TEXT NOT NULL,
  records_processed INTEGER NOT NULL DEFAULT 0 CHECK (records_processed >= 0),
  status TEXT NOT NULL CHECK (status IN ('started', 'success', 'failed', 'prepared', 'not_configured')),
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_automation_connections_vendor_active
  ON automation_connections (vendor, is_active);

CREATE INDEX IF NOT EXISTS idx_automation_tank_mappings_connection
  ON automation_tank_mappings (connection_id);

CREATE INDEX IF NOT EXISTS idx_automation_nozzle_mappings_connection
  ON automation_nozzle_mappings (connection_id);

CREATE INDEX IF NOT EXISTS idx_automation_sync_logs_connection_started
  ON automation_sync_logs (connection_id, started_at DESC);
