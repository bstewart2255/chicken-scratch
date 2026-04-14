-- Store fingerprint comparison results on auth attempts
ALTER TABLE auth_attempts ADD COLUMN fingerprint_match TEXT;
