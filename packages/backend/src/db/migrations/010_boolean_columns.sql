-- Convert INTEGER boolean columns to native Postgres BOOLEAN
-- Required after SQLite → Postgres migration (SQLite used INTEGER 0/1)

ALTER TABLE users
  ALTER COLUMN enrolled DROP DEFAULT,
  ALTER COLUMN enrolled TYPE BOOLEAN USING (enrolled::boolean),
  ALTER COLUMN enrolled SET DEFAULT FALSE;

ALTER TABLE baselines
  ALTER COLUMN has_pressure_data DROP DEFAULT,
  ALTER COLUMN has_pressure_data TYPE BOOLEAN USING (has_pressure_data::boolean),
  ALTER COLUMN has_pressure_data SET DEFAULT FALSE;

ALTER TABLE auth_attempts
  ALTER COLUMN authenticated TYPE BOOLEAN USING (authenticated::boolean),
  ALTER COLUMN is_forgery DROP DEFAULT,
  ALTER COLUMN is_forgery TYPE BOOLEAN USING (is_forgery::boolean),
  ALTER COLUMN is_forgery SET DEFAULT FALSE;

ALTER TABLE tenants
  ALTER COLUMN active DROP DEFAULT,
  ALTER COLUMN active TYPE BOOLEAN USING (active::boolean),
  ALTER COLUMN active SET DEFAULT TRUE;
