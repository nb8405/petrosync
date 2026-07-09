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
