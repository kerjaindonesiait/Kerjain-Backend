INSERT INTO app_settings (key, value)
VALUES ('require_verified_to_quote', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
