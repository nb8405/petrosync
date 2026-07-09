ALTER TABLE backup_history
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS backup_size_bytes BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checksum TEXT,
  ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS metadata_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS backup_schedule_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT false,
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  run_time TEXT NOT NULL DEFAULT '02:00',
  retention_count INTEGER NOT NULL DEFAULT 7 CHECK (retention_count >= 1),
  updated_by BIGINT REFERENCES app_users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO backup_schedule_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_backup_history_status_started
  ON backup_history (status, started_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_backup_history_checksum
  ON backup_history (checksum)
  WHERE deleted_at IS NULL;
