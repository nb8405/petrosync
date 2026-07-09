DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'app_users'::regclass
      AND conname = 'app_users_password_hash_argon2id'
  ) THEN
    ALTER TABLE app_users
      ADD CONSTRAINT app_users_password_hash_argon2id
      CHECK (password_hash LIKE '$argon2id$%') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'app_users'::regclass
      AND conname = 'app_users_security_answer_hash_argon2id'
  ) THEN
    ALTER TABLE app_users
      ADD CONSTRAINT app_users_security_answer_hash_argon2id
      CHECK (security_answer_hash IS NULL OR security_answer_hash LIKE '$argon2id$%') NOT VALID;
  END IF;
END $$;
