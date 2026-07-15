-- Fixes: "new row violates row-level security policy for table teacher_assignments"
--
-- Root cause: migrations 002/003 ran ALTER TABLE ... ENABLE ROW LEVEL SECURITY on
-- teacher_assignments, but the one policy-creation block that followed checked
-- pg_policies using the wrong column name ("polname" instead of "policyname" --
-- the same bug already fixed for public.subjects in migration 004). That check
-- fails at runtime, so the CREATE POLICY statement inside it never ran. The result:
-- RLS has been enabled on teacher_assignments with ZERO policies ever created on
-- it -- not even a read policy. With RLS on and no policies, Postgres denies every
-- operation by default for normal (non service-role) clients, which is exactly the
-- INSERT failure being reported.
--
-- This migration is new and independent: it does not modify 002/003 (already
-- historical) and does not touch teacher_assignments' columns/constraints.
--
-- Design: SELECT stays open to any authenticated user, because
-- src/modules/attendance (تحضير الحصص) reads a teacher's own rows from this table
-- to know which subject/grade/section combinations they may prepare attendance
-- for -- locking SELECT down to principal/admin/vice_principal would break that
-- page for every teacher. Only WRITE access (INSERT/UPDATE/DELETE) is restricted
-- to principal/admin/vice_principal, per profiles.role, matching the same pattern
-- already used for public.subjects (migration 004) and public.school_settings
-- (migrations 005/006).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'teacher_assignments_select_authenticated' AND tablename = 'teacher_assignments'
  ) THEN
    CREATE POLICY teacher_assignments_select_authenticated ON public.teacher_assignments
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'teacher_assignments_insert_managers' AND tablename = 'teacher_assignments'
  ) THEN
    CREATE POLICY teacher_assignments_insert_managers ON public.teacher_assignments
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
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'teacher_assignments_update_managers' AND tablename = 'teacher_assignments'
  ) THEN
    CREATE POLICY teacher_assignments_update_managers ON public.teacher_assignments
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
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'teacher_assignments_delete_managers' AND tablename = 'teacher_assignments'
  ) THEN
    CREATE POLICY teacher_assignments_delete_managers ON public.teacher_assignments
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal')
        )
      );
  END IF;
END$$;
