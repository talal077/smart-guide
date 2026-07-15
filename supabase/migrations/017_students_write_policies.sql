-- Closes a critical, live-verified RLS gap on public.students: migration 001 only ever
-- defined a SELECT policy ("select_authenticated"), yet direct testing against the live
-- database (real anon-key client, real authenticated sessions, no service role) proved
-- that INSERT/UPDATE/DELETE on public.students currently succeed for ANY authenticated
-- user regardless of role -- confirmed for a "teacher" profile and even a "student"
-- profile, not just principal/admin/vice_principal. Since no INSERT/UPDATE/DELETE policy
-- for students exists anywhere in tracked migrations, this means a permissive policy for
-- those commands was applied directly on the live database outside of tracked migrations
-- (the same drift pattern already called out in migrations 010/013/014's comments).
--
-- Because Postgres RLS policies are OR'd together (any one matching permissive policy
-- grants access), simply adding a new restrictive-looking policy would NOT revoke the
-- unknown live one -- it has to be dropped first. Since its name isn't known (not in
-- tracked migrations), Section 1 finds and drops *whatever* INSERT/UPDATE/DELETE
-- policies currently exist on public.students dynamically, then Section 2 recreates the
-- correct role-scoped ones. This makes the migration self-healing regardless of what
-- undocumented policy is actually live.
--
-- Scope matches the "إدارة الطلاب" (student management) access-control requirement:
-- principal/admin/vice_principal get full write access; teacher and student get none
-- (teachers view their own section's roster read-only in the app, which the existing
-- select_authenticated policy already allows).
--
-- Also adds a uniqueness guard on students.national_id ("رقم الهوية"), matching the
-- app-level duplicate-prevention check added to /students. Verified live via direct
-- query before writing this: 440 non-null national_id values, 0 duplicates -- safe to
-- add without any backfill/cleanup. NULLs remain unrestricted (Postgres UNIQUE allows
-- multiple NULLs), matching that the column has always been nullable.

-- =========================================================================
-- 1) Drop whatever INSERT/UPDATE/DELETE policies currently exist on students
--    (undocumented, applied outside tracked migrations -- see note above).
-- =========================================================================

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'students' AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
  LOOP
    RAISE NOTICE 'Dropping pre-existing policy on public.students: % (this was not defined in any tracked migration)', pol.policyname;
    EXECUTE format('DROP POLICY %I ON public.students', pol.policyname);
  END LOOP;
END$$;

-- =========================================================================
-- 2) Recreate INSERT/UPDATE/DELETE, scoped to principal/admin/vice_principal only.
-- =========================================================================

CREATE POLICY students_insert_managers ON public.students
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
  );

CREATE POLICY students_update_managers ON public.students
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
  );

CREATE POLICY students_delete_managers ON public.students
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
  );

-- =========================================================================
-- 3) Uniqueness on national_id ("رقم الهوية"), mirroring the existing
--    students_entry_code_unique constraint from migration 001.
-- =========================================================================

DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT national_id FROM public.students
    WHERE national_id IS NOT NULL AND national_id <> ''
    GROUP BY national_id HAVING count(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Refusing to add unique constraint on students.national_id: % duplicate value(s) found. Inspect them with: SELECT national_id, count(*) FROM public.students WHERE national_id IS NOT NULL AND national_id <> '''' GROUP BY national_id HAVING count(*) > 1; -- resolve manually, then rerun this migration.', dup_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'students_national_id_unique' AND t.relname = 'students'
  ) THEN
    ALTER TABLE public.students ADD CONSTRAINT students_national_id_unique UNIQUE (national_id);
  END IF;
END$$;
