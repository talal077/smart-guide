-- Fix RLS on public.subjects: allow write access (INSERT/UPDATE/DELETE) only to
-- principal, admin and vice_principal roles (per public.profiles.role). Teachers
-- keep read-only access via the existing subjects_select_authenticated policy.
-- Without this, adding a subject from the teacher-assignments page fails with:
--   "new row violates row-level security policy for table \"subjects\""

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'subjects_insert_managers' AND tablename = 'subjects') THEN
    CREATE POLICY subjects_insert_managers ON public.subjects
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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'subjects_update_managers' AND tablename = 'subjects') THEN
    CREATE POLICY subjects_update_managers ON public.subjects
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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'subjects_delete_managers' AND tablename = 'subjects') THEN
    CREATE POLICY subjects_delete_managers ON public.subjects
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal')
        )
      );
  END IF;
END$$;
