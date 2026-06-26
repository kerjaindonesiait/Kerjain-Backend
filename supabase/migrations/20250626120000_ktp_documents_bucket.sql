-- Private bucket for technician KTP and selfie (admin access via signed URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('ktp-documents', 'ktp-documents', false)
ON CONFLICT (id) DO NOTHING;
