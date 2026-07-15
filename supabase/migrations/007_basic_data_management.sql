-- Supports the "إدارة البيانات الأساسية" page: a reference list of sections (الشعب),
-- write access for custom grade levels, and a DB-level guarantee that a given
-- subject+grade+section combination is never assigned to more than one teacher.

CREATE TABLE IF NOT EXISTS public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0
);

ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sections_select_authenticated' AND tablename = 'sections') THEN
    CREATE POLICY sections_select_authenticated ON public.sections
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sections_insert_managers' AND tablename = 'sections') THEN
    CREATE POLICY sections_insert_managers ON public.sections
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal')
        )
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sections_update_managers' AND tablename = 'sections') THEN
    CREATE POLICY sections_update_managers ON public.sections
      FOR UPDATE USING (
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

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sections_delete_managers' AND tablename = 'sections') THEN
    CREATE POLICY sections_delete_managers ON public.sections
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal')
        )
      );
  END IF;
END$$;

-- grade_levels only had a SELECT policy so far; allow management-role write access so
-- "إدارة البيانات الأساسية" can add/remove a custom grade for the school's current stage.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'grade_levels_insert_managers' AND tablename = 'grade_levels') THEN
    CREATE POLICY grade_levels_insert_managers ON public.grade_levels
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal')
        )
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'grade_levels_delete_managers' AND tablename = 'grade_levels') THEN
    CREATE POLICY grade_levels_delete_managers ON public.grade_levels
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal')
        )
      );
  END IF;
END$$;

-- Prevent the same subject+grade+section from ever being assigned to more than one
-- teacher (previously only checked client-side before insert/update).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'teacher_assignments_subject_grade_section_unique' AND t.relname = 'teacher_assignments'
  ) THEN
    ALTER TABLE public.teacher_assignments
      ADD CONSTRAINT teacher_assignments_subject_grade_section_unique UNIQUE (subject_id, grade, section);
  END IF;
END$$;
