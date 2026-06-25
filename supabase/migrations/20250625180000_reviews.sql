CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id)
);

CREATE INDEX IF NOT EXISTS reviews_reviewee_id_idx ON reviews (reviewee_id);
CREATE INDEX IF NOT EXISTS reviews_job_id_idx ON reviews (job_id);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Technician aggregate rating (used by reviewStats.ts)
ALTER TABLE technician_profiles ADD COLUMN IF NOT EXISTS rating numeric(3,1) DEFAULT 0;
ALTER TABLE technician_profiles ADD COLUMN IF NOT EXISTS review_count int NOT NULL DEFAULT 0;
