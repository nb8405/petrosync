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
