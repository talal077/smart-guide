-- Root-cause fix for public.sections.
--
-- What was actually wrong (confirmed by querying the live database schema via the
-- PostgREST OpenAPI introspection endpoint, not guessed from the migration files):
-- a table named "sections" already existed before migration 007 ever ran — created
-- outside the migration history (most likely by hand in the Supabase Table Editor).
-- Its real shape was:
--   id          text  NOT NULL, NO DEFAULT   (should be uuid with gen_random_uuid())
--   name        text  NOT NULL
--   grade       text  NOT NULL, NO DEFAULT   (stray column, not part of this feature)
--   sort_order  <missing until migration 008 added it>
--
-- Because 007 used CREATE TABLE IF NOT EXISTS, it silently skipped creating the
-- correct table and left this incompatible one in place. That is why inserts failed
-- twice: first "column sections.sort_order does not exist" (before 008), then
-- "null value in column \"id\" ... violates not-null constraint" (id has no default,
-- and the app never supplies one — and the stray "grade" NOT NULL column would have
-- failed the same insert next).
--
-- Verified directly against the live database that public.sections currently holds
-- zero rows, so it is safe to rebuild from scratch with no data-loss risk. The
-- correct shape — matching src/lib/basicData.ts and the إدارة البيانات الأساسية /
-- إسناد المعلمين pages — is a flat, reusable list of section labels ("أ", "ب", "1",
-- "2", ...), independent of subject/grade (that relationship lives in
-- teacher_assignments, which already has its own subject_id/grade/section columns
-- and does not reference sections by foreign key).
--
-- This migration is safe to run whether or not the rogue table is present: it only
-- drops+recreates public.sections if its "id" column is not uuid; otherwise it is a
-- no-op (CREATE TABLE IF NOT EXISTS already matches).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sections' AND column_name = 'id' AND data_type <> 'uuid'
  ) THEN
    DROP TABLE public.sections CASCADE;
  END IF;
END$$;

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
