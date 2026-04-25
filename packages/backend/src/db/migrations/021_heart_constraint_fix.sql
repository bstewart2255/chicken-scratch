-- Fix migration 020. That migration assumed the existing CHECK constraint
-- on shape_type was named `shape_samples_shape_type_check`, but Postgres
-- actually named it `shape_samples_new_shape_type_check` (because migration
-- 006 created the table as `shape_samples_new` then renamed it — and
-- Postgres does NOT rename associated constraints during a table rename).
--
-- Net effect of migration 020: the DROP IF EXISTS was a silent no-op, the
-- ADD created a second constraint with a different name, and BOTH check
-- constraints now fire on INSERT. The OLD constraint (without 'heart')
-- rejects any heart row. Hence the 500 error users hit when submitting
-- a heart shape.
--
-- This migration dynamically enumerates CHECK constraints on shape_type
-- (regardless of name) and drops them, then re-adds the correct one with
-- a known name. Idempotent — safe to run if it already ran.

DO $$
DECLARE
  c_name TEXT;
BEGIN
  -- shape_samples
  FOR c_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'shape_samples'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%shape_type%'
  LOOP
    EXECUTE 'ALTER TABLE shape_samples DROP CONSTRAINT ' || quote_ident(c_name);
  END LOOP;

  -- shape_baselines
  FOR c_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'shape_baselines'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%shape_type%'
  LOOP
    EXECUTE 'ALTER TABLE shape_baselines DROP CONSTRAINT ' || quote_ident(c_name);
  END LOOP;
END $$;

ALTER TABLE shape_samples
  ADD CONSTRAINT shape_samples_shape_type_check
  CHECK (shape_type IN ('circle', 'square', 'triangle', 'house', 'smiley', 'heart'));

ALTER TABLE shape_baselines
  ADD CONSTRAINT shape_baselines_shape_type_check
  CHECK (shape_type IN ('circle', 'square', 'triangle', 'house', 'smiley', 'heart'));
