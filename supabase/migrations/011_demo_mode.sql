-- Demo Mode: schema support for generating/removing realistic demo data without
-- touching real accounts or school settings.
--
-- Adds an `is_demo boolean` flag to every table the demo generator writes to, so
-- "إعادة إنشاء البيانات التجريبية" can delete exactly (and only) what it created,
-- regardless of what real data an admin has already entered manually. Also adds a
-- few columns needed to represent a demo teacher/student (email, national_id,
-- status) that did not exist yet, and a new class_schedule table for the weekly
-- timetable (لا يوجد جدول جدول دراسي حتى الآن -- /schedule was a static mock).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS national_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS national_id text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.sections ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.teacher_assignments ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.lesson_submissions ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.excuses ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.class_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week text NOT NULL CHECK (day_of_week IN ('الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس')),
  period int NOT NULL,
  grade text NOT NULL,
  section text NOT NULL,
  subject_id uuid REFERENCES public.subjects(id),
  teacher_id uuid REFERENCES public.profiles(id),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'class_schedule_slot_unique' AND t.relname = 'class_schedule'
  ) THEN
    ALTER TABLE public.class_schedule
      ADD CONSTRAINT class_schedule_slot_unique UNIQUE (day_of_week, period, grade, section);
  END IF;
END$$;

ALTER TABLE public.class_schedule ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'class_schedule_select_authenticated' AND tablename = 'class_schedule') THEN
    CREATE POLICY class_schedule_select_authenticated ON public.class_schedule
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'class_schedule_write_managers' AND tablename = 'class_schedule') THEN
    CREATE POLICY class_schedule_write_managers ON public.class_schedule
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal')
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal')
        )
      );
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_class_schedule_grade_section ON public.class_schedule (grade, section);
CREATE INDEX IF NOT EXISTS idx_attendance_records_is_demo ON public.attendance_records (is_demo);
CREATE INDEX IF NOT EXISTS idx_lesson_submissions_is_demo ON public.lesson_submissions (is_demo);
