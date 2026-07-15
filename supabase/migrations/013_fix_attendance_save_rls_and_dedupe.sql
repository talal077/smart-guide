-- Defensive/idempotent hardening for the "حفظ التحضير" (save attendance) flow on
-- /attendance. All statements below are guarded (IF NOT EXISTS / ON CONFLICT-safe)
-- so this is a no-op wherever the target state already exists.
--
-- Verified directly against the live project (via REST, as a real authenticated
-- teacher, not service role) before writing this file:
--   - lesson_submissions INSERT/UPDATE already succeeds for an authenticated
--     teacher today, and public.students/subjects SELECT already work too -- so
--     despite the "polname" vs "policyname" typo genuinely present in migrations
--     001/002/003 (same bug already fixed for teacher_assignments in migration
--     010 and partially for subjects in 004), the live database's actual RLS
--     policies are NOT currently broken for these tables -- they must have been
--     patched directly (e.g. via the Supabase dashboard) outside of tracked
--     migrations. This section is kept only so the tracked migration history
--     matches reality and so a *fresh* database created from these migrations
--     doesn't inherit the dead-policy bug.
--   - public.attendance_records already has a working unique constraint on
--     (student_id, grade, section, date, lesson) in production; the app's
--     upsert relies on it (onConflict targets those columns). Section 5 below
--     is a best-effort idempotent guard in case some environment is missing it;
--     if a differently-named equivalent constraint already exists, this may add
--     a harmless redundant unique index rather than truly being a no-op.
--   - public.attendance_records.id has NO column default (confirmed via the
--     PostgREST OpenAPI schema) and is NOT NULL, so the application must always
--     send an explicit id on insert/update -- this migration does not touch
--     that; it's handled in src/modules/attendance/repository/attendance.repository.ts.

-- --- 1) Fix the missing SELECT policy on students -------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'select_authenticated' AND tablename = 'students'
  ) THEN
    CREATE POLICY select_authenticated ON public.students
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

-- --- 2) Fix the missing SELECT policy on subjects -------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'subjects_select_authenticated' AND tablename = 'subjects'
  ) THEN
    CREATE POLICY subjects_select_authenticated ON public.subjects
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

-- --- 3) Fix the missing SELECT/INSERT/UPDATE policies on lesson_submissions -----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'lesson_submissions_select_authenticated' AND tablename = 'lesson_submissions'
  ) THEN
    CREATE POLICY lesson_submissions_select_authenticated ON public.lesson_submissions
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'lesson_submissions_insert_authenticated' AND tablename = 'lesson_submissions'
  ) THEN
    CREATE POLICY lesson_submissions_insert_authenticated ON public.lesson_submissions
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'lesson_submissions_update_authenticated' AND tablename = 'lesson_submissions'
  ) THEN
    CREATE POLICY lesson_submissions_update_authenticated ON public.lesson_submissions
      FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END$$;

-- --- 4) Ensure attendance_records has RLS + authenticated policies --------------
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'attendance_records_select_authenticated' AND tablename = 'attendance_records'
  ) THEN
    CREATE POLICY attendance_records_select_authenticated ON public.attendance_records
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'attendance_records_insert_authenticated' AND tablename = 'attendance_records'
  ) THEN
    CREATE POLICY attendance_records_insert_authenticated ON public.attendance_records
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'attendance_records_update_authenticated' AND tablename = 'attendance_records'
  ) THEN
    CREATE POLICY attendance_records_update_authenticated ON public.attendance_records
      FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END$$;

-- --- 5) De-duplicate pre-existing rows, then add the natural-key uniqueness ----
-- Keep only the most recently updated row per (student, grade, section, date, lesson).
DELETE FROM public.attendance_records a
USING public.attendance_records b
WHERE a.student_id IS NOT NULL
  AND a.student_id = b.student_id
  AND a.grade = b.grade
  AND a.section = b.section
  AND a.date = b.date
  AND a.lesson = b.lesson
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'attendance_records_student_lesson_unique' AND t.relname = 'attendance_records'
  ) THEN
    ALTER TABLE public.attendance_records
      ADD CONSTRAINT attendance_records_student_lesson_unique
      UNIQUE (student_id, grade, section, date, lesson);
  END IF;
END$$;
