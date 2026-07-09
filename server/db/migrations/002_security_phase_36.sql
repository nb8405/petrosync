CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Owner', 'Manager', 'Accountant', 'Supervisor', 'Operator', 'Auditor', 'ReadOnly')),
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  recovery_email TEXT,
  recovery_phone TEXT,
  security_question TEXT,
  security_answer_hash TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_address TEXT,
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

CREATE INDEX IF NOT EXISTS idx_restore_approvals_status
  ON restore_approvals (status, requested_at DESC);
