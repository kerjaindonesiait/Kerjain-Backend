-- Job map pins and completion timestamp
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Payment escrow release tracking
ALTER TABLE payments ADD COLUMN IF NOT EXISTS escrow_release_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS released_at timestamptz;
