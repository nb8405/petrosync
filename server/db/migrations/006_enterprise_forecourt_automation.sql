CREATE TABLE IF NOT EXISTS forecourt_islands (
  id BIGSERIAL PRIMARY KEY,
  island_number TEXT NOT NULL UNIQUE,
  island_name TEXT NOT NULL,
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('Four Wheeler', 'Two Wheeler', 'Mixed')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forecourt_pumps (
  id BIGSERIAL PRIMARY KEY,
  pump_number TEXT NOT NULL UNIQUE,
  manufacturer TEXT NOT NULL,
  model TEXT,
  automation_id TEXT,
  atg_id TEXT,
  atos_id TEXT,
  status TEXT NOT NULL DEFAULT 'Offline' CHECK (status IN ('Online', 'Offline', 'Maintenance')),
  island_id BIGINT REFERENCES forecourt_islands(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forecourt_nozzles (
  id BIGSERIAL PRIMARY KEY,
  pump_id BIGINT NOT NULL REFERENCES forecourt_pumps(id) ON DELETE CASCADE,
  nozzle_number TEXT NOT NULL,
  product_type TEXT NOT NULL,
  automation_id TEXT,
  atg_id TEXT,
  atos_id TEXT,
  current_meter_reading NUMERIC(14, 3) NOT NULL DEFAULT 0,
  opening_reading NUMERIC(14, 3) NOT NULL DEFAULT 0,
  closing_reading NUMERIC(14, 3) NOT NULL DEFAULT 0,
  testing_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  total_sales NUMERIC(14, 3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pump_id, nozzle_number)
);

CREATE TABLE IF NOT EXISTS forecourt_tanks (
  id BIGSERIAL PRIMARY KEY,
  tank_number TEXT NOT NULL UNIQUE,
  product_type TEXT NOT NULL,
  automation_id TEXT,
  atg_id TEXT,
  atos_id TEXT,
  capacity NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (capacity >= 0),
  current_stock NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  water_level NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (water_level >= 0),
  temperature NUMERIC(8, 3),
  safe_capacity_percentage NUMERIC(6, 2) NOT NULL DEFAULT 90 CHECK (safe_capacity_percentage BETWEEN 1 AND 100),
  reorder_level NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  health_status TEXT NOT NULL DEFAULT 'Online' CHECK (health_status IN ('Online', 'Offline', 'Warning')),
  last_reading_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tank_readings (
  id BIGSERIAL PRIMARY KEY,
  tank_id BIGINT NOT NULL REFERENCES forecourt_tanks(id) ON DELETE CASCADE,
  reading_source TEXT NOT NULL DEFAULT 'manual' CHECK (reading_source IN ('manual', 'atg', 'atos')),
  product_type TEXT NOT NULL,
  current_stock NUMERIC(14, 3) NOT NULL DEFAULT 0,
  water_level NUMERIC(14, 3) NOT NULL DEFAULT 0,
  temperature NUMERIC(8, 3),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES app_users(id)
);

CREATE TABLE IF NOT EXISTS tank_alerts (
  id BIGSERIAL PRIMARY KEY,
  tank_id BIGINT REFERENCES forecourt_tanks(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'Medium' CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Acknowledged', 'Resolved')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS device_statuses (
  id BIGSERIAL PRIMARY KEY,
  device_type TEXT NOT NULL CHECK (device_type IN ('Pump', 'Tank', 'Server', 'Database', 'Printer', 'Network')),
  device_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Offline' CHECK (status IN ('Online', 'Offline', 'Warning')),
  message TEXT,
  last_seen_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (device_type, device_name)
);

CREATE TABLE IF NOT EXISTS shift_configs (
  id BIGSERIAL PRIMARY KEY,
  shift_name TEXT NOT NULL UNIQUE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shift_records (
  id BIGSERIAL PRIMARY KEY,
  shift_config_id BIGINT REFERENCES shift_configs(id) ON DELETE SET NULL,
  operator_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  attendant_id BIGINT,
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Closed')),
  opening_cash NUMERIC(14, 2) NOT NULL DEFAULT 0,
  closing_cash NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_sales NUMERIC(14, 2) NOT NULL DEFAULT 0,
  expenses NUMERIC(14, 2) NOT NULL DEFAULT 0,
  handover_notes TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_by BIGINT REFERENCES app_users(id)
);

CREATE TABLE IF NOT EXISTS day_end_records (
  id BIGSERIAL PRIMARY KEY,
  business_date DATE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed', 'Failed')),
  validations JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  locked BOOLEAN NOT NULL DEFAULT false,
  completed_by BIGINT REFERENCES app_users(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alarms (
  id BIGSERIAL PRIMARY KEY,
  alarm_type TEXT NOT NULL CHECK (alarm_type IN ('Low Tank Stock', 'Pump Offline', 'Nozzle Error', 'Database Error', 'Network Error')),
  severity TEXT NOT NULL DEFAULT 'Medium' CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  source_type TEXT,
  source_id TEXT,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Acknowledged', 'Resolved')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_by BIGINT REFERENCES app_users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_by BIGINT REFERENCES app_users(id),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dry_stock_items (
  id BIGSERIAL PRIMARY KEY,
  item_name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('Engine Oil', 'Gear Oil', 'Grease', 'Additives', 'Consumables')),
  unit TEXT NOT NULL DEFAULT 'pcs',
  opening_stock NUMERIC(14, 3) NOT NULL DEFAULT 0,
  current_stock NUMERIC(14, 3) NOT NULL DEFAULT 0,
  low_stock_level NUMERIC(14, 3) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dry_stock_movements (
  id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES dry_stock_items(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('Opening', 'Purchase', 'Sale', 'Adjustment')),
  quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by BIGINT REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendants (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  employee_id TEXT NOT NULL UNIQUE,
  shift_config_id BIGINT REFERENCES shift_configs(id) ON DELETE SET NULL,
  assigned_pump_id BIGINT REFERENCES forecourt_pumps(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_shift_records_attendant'
  ) THEN
    ALTER TABLE shift_records
      ADD CONSTRAINT fk_shift_records_attendant
      FOREIGN KEY (attendant_id) REFERENCES attendants(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS attendant_sales (
  id BIGSERIAL PRIMARY KEY,
  attendant_id BIGINT NOT NULL REFERENCES attendants(id) ON DELETE CASCADE,
  shift_record_id BIGINT REFERENCES shift_records(id) ON DELETE SET NULL,
  product_type TEXT NOT NULL CHECK (product_type IN ('MS', 'HSD', 'XP95', 'XG')),
  fuel_sold NUMERIC(14, 3) NOT NULL DEFAULT 0,
  collection_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS station_settings (
  id BIGSERIAL PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  section TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by BIGINT REFERENCES app_users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO shift_configs (shift_name, start_time, end_time)
VALUES
  ('Morning Shift', '06:00', '14:00'),
  ('Evening Shift', '14:00', '22:00'),
  ('Night Shift', '22:00', '06:00')
ON CONFLICT (shift_name) DO NOTHING;

INSERT INTO station_settings (setting_key, section, value)
VALUES
  ('station', 'Station Settings', '{"stationName":"MAYA FILLING CENTRE [KSK]"}'),
  ('tax', 'Tax Settings', '{"gstEnabled":true,"gstPercent":0}'),
  ('receipt', 'Receipt Settings', '{"printHeader":"MAYA FILLING CENTRE [KSK]","showGst":true}'),
  ('dsr_template', 'DSR Template Settings', '{"template":"standard"}')
ON CONFLICT (setting_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_forecourt_pumps_island
  ON forecourt_pumps (island_id);

CREATE INDEX IF NOT EXISTS idx_forecourt_nozzles_pump
  ON forecourt_nozzles (pump_id);

CREATE INDEX IF NOT EXISTS idx_forecourt_tanks_product
  ON forecourt_tanks (product_type);

CREATE INDEX IF NOT EXISTS idx_tank_readings_tank_recorded
  ON tank_readings (tank_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_tank_alerts_status
  ON tank_alerts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_statuses_type
  ON device_statuses (device_type, status);

CREATE INDEX IF NOT EXISTS idx_shift_records_date_status
  ON shift_records (shift_date, status);

CREATE INDEX IF NOT EXISTS idx_day_end_records_date
  ON day_end_records (business_date);

CREATE INDEX IF NOT EXISTS idx_alarms_status_created
  ON alarms (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dry_stock_movements_item_date
  ON dry_stock_movements (item_id, movement_date DESC);

CREATE INDEX IF NOT EXISTS idx_attendant_sales_date
  ON attendant_sales (sale_date DESC, attendant_id);
