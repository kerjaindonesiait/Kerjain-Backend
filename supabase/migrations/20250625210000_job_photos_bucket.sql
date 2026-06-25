-- Public bucket for job listing photos (POST /api/upload/job-photo)
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-photos', 'job-photos', true)
ON CONFLICT (id) DO NOTHING;
