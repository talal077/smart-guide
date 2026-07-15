-- OPTIONAL and SEPARATE from migration 015. Not required for the reports RPC
-- functions to work -- they already handle attendance_records.date safely as
-- `text` via NULLIF(date,'')::date casts plus a validity guard. This file
-- only removes the root cause (the wrong column type itself) for any other,
-- future code that touches attendance_records.date directly.
--
-- Live verification before writing this file (via the PostgREST OpenAPI
-- schema + a full-table scan, same technique as migration 014):
--   - attendance_records.date is `text` live, all 21,562 existing rows are
--     valid ISO (YYYY-MM-DD): 0 NULL, 0 empty string, 0 rows failing
--     ^[0-9]{4}-[0-9]{2}-[0-9]{2}$.
-- This migration re-verifies that at run time (data can change between when
-- this was written and when it's actually applied) and refuses to convert if
-- it finds anything that wouldn't survive the cast, rather than silently
-- corrupting or dropping rows.
--
-- Idempotent / safe to rerun: if the column is already `date` (e.g. this was
-- already applied, or a fresh database created these tables with the type
-- migration 002/003/012 originally intended), this is a no-op.

DO $$
DECLARE
  current_type text;
  bad_count integer;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'attendance_records' AND column_name = 'date';

  IF current_type IS NULL THEN
    RAISE NOTICE 'public.attendance_records.date not found -- skipping (table/column missing).';
    RETURN;
  END IF;

  IF current_type = 'date' THEN
    RAISE NOTICE 'public.attendance_records.date is already `date` -- nothing to do.';
    RETURN;
  END IF;

  SELECT count(*) INTO bad_count
  FROM public.attendance_records
  WHERE date IS NOT NULL
    AND date <> ''
    AND date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'Refusing to convert attendance_records.date to `date`: % row(s) contain non-ISO values. Inspect them with: SELECT id, date FROM public.attendance_records WHERE date IS NOT NULL AND date <> '''' AND date !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' LIMIT 20; -- fix or null them out, then rerun this migration.',
      bad_count;
  END IF;

  ALTER TABLE public.attendance_records
    ALTER COLUMN date TYPE date USING NULLIF(date, '')::date;

  RAISE NOTICE 'public.attendance_records.date converted from text to date.';
END$$;
