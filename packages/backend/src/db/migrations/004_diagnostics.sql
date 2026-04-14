-- Add richer diagnostic data to auth_attempts
ALTER TABLE auth_attempts ADD COLUMN attempt_type TEXT NOT NULL DEFAULT 'signature';
ALTER TABLE auth_attempts ADD COLUMN signature_features TEXT;
ALTER TABLE auth_attempts ADD COLUMN signature_comparison TEXT;
ALTER TABLE auth_attempts ADD COLUMN shape_scores TEXT;
ALTER TABLE auth_attempts ADD COLUMN shape_details TEXT;
