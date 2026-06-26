-- SMS OTP verification for signup phone numbers
CREATE TABLE IF NOT EXISTS phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  attempt_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_verifications_phone_created_idx
  ON phone_verifications (phone, created_at DESC);

ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE technician_profiles
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;
