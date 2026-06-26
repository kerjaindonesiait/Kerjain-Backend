-- Remove WhatsApp OTP verification schema
DROP TABLE IF EXISTS phone_otp_challenges;
ALTER TABLE users DROP COLUMN IF EXISTS phone_verified;
ALTER TABLE technician_profiles DROP COLUMN IF EXISTS phone_verified;
