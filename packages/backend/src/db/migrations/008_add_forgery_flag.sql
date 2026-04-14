-- Add forgery flag to auth_attempts for manually marking attempts as forgery tests
ALTER TABLE auth_attempts ADD COLUMN is_forgery INTEGER NOT NULL DEFAULT 0;
