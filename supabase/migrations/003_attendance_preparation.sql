-- Attendance preparation feature: subjects, teacher assignments, lesson submissions.
-- Additive only: does not alter existing RLS or data on students/profiles/attendance_records.

-- Subjects taught at the school
CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  created_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'subjects_name_unique' AND t.relname = 'subjects'
  ) THEN
    ALTER TABLE public.subjects ADD CONSTRAINT subjects_name_unique UNIQUE (name);
  END IF;
END$$;

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'subjects_select_authenticated' AND tablename = 'subjects') THEN
    CREATE POLICY subjects_select_authenticated ON public.subjects
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

-- Which teacher teaches which subject, to which grade/section
CREATE TABLE IF NOT EXISTS public.teacher_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  grade text NOT NULL,
  section text NOT NULL,
  created_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'teacher_assignments_unique' AND t.relname = 'teacher_assignments'
  ) THEN
    ALTER TABLE public.teacher_assignments ADD CONSTRAINT teacher_assignments_unique UNIQUE (teacher_id, subject_id, grade, section);
  END IF;
END$$;

ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'teacher_assignments_select_authenticated' AND tablename = 'teacher_assignments') THEN
    CREATE POLICY teacher_assignments_select_authenticated ON public.teacher_assignments
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

-- Per lesson (grade/section/date/lesson) preparation status: draft vs submitted to the vice principal.
CREATE TABLE IF NOT EXISTS public.lesson_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  grade text NOT NULL,
  section text NOT NULL,
  date date NOT NULL,
  lesson text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  saved_at timestamptz DEFAULT now(),
  submitted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'lesson_submissions_unique' AND t.relname = 'lesson_submissions'
  ) THEN
    ALTER TABLE public.lesson_submissions ADD CONSTRAINT lesson_submissions_unique UNIQUE (grade, section, date, lesson);
  END IF;
END$$;

ALTER TABLE public.lesson_submissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'lesson_submissions_select_authenticated' AND tablename = 'lesson_submissions') THEN
    CREATE POLICY lesson_submissions_select_authenticated ON public.lesson_submissions
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'lesson_submissions_insert_authenticated' AND tablename = 'lesson_submissions') THEN
    CREATE POLICY lesson_submissions_insert_authenticated ON public.lesson_submissions
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE polname = 'lesson_submissions_update_authenticated' AND tablename = 'lesson_submissions') THEN
    CREATE POLICY lesson_submissions_update_authenticated ON public.lesson_submissions
      FOR UPDATE USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END$$;

-- Safety net: create attendance_records if it somehow does not exist yet (it already exists in
-- production and is used by src/lib/attendance.ts). This is a no-op when the table is already there.
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid,
  student_name text,
  grade text,
  section text,
  date date,
  lesson text,
  status text NOT NULL DEFAULT 'present',
  teacher_id uuid,
  teacher_name text,
  attendance_time timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Additive columns required by the lesson-preparation feature (per-student notes, subject link).
DO $$
BEGIN
  IF to_regclass('public.attendance_records') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'attendance_records' AND column_name = 'notes'
    ) THEN
      ALTER TABLE public.attendance_records ADD COLUMN notes text;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'attendance_records' AND column_name = 'subject_id'
    ) THEN
      ALTER TABLE public.attendance_records ADD COLUMN subject_id uuid REFERENCES public.subjects(id);
    END IF;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_attendance_records_lookup ON public.attendance_records (grade, section, date, lesson);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher ON public.teacher_assignments (teacher_id);

-- NOTES:
-- 1) Populate subjects and teacher_assignments from the Supabase SQL editor (or a future admin UI):
--      insert into public.subjects (name) values ('رياضيات'), ('لغتي'), ...;
--      insert into public.teacher_assignments (teacher_id, subject_id, grade, section)
--        values ('<profiles.id of the teacher>', '<subjects.id>', '1', 'أ');
-- 2) Service Role bypasses RLS; server-side routes using the service role key can write regardless of policies.
