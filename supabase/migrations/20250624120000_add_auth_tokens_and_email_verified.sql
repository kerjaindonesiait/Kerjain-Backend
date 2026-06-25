-- Email verification flag on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;

-- OAuth users are already verified by provider
UPDATE users SET email_verified = true
WHERE id IN (SELECT user_id FROM oauth_accounts) AND email_verified = false;

-- One-time tokens for email verify & password reset
CREATE TABLE IF NOT EXISTS auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('email_verify', 'password_reset')),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_tokens_hash_type_idx ON auth_tokens (token_hash, type) WHERE used_at IS NULL;

ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
