-- Upgrade the (previously untracked, hand-created) student_actions table to support
-- the new "إجراءات الطالب" workflow: structured teacher/requester references, date/time
-- columns, completion/postponement tracking, status lifecycle, and RLS. Also extends the
-- existing notifications and audit_logs tables (also previously untracked) with the
-- columns needed to link them to a student action.
--
-- Verified live schema directly via the PostgREST OpenAPI introspection before writing
-- this (not from stale tracked migrations, per the drift warning in 009/013): as of
-- writing, student_actions has 0 rows and audit_logs has 0 rows, so the destructive-looking
-- steps below (RENAME/DROP COLUMN, SET NOT NULL) are safe with no data loss or backfill
-- required. notifications has ~20 seeded demo rows; only additive/idempotent changes are
-- made to it. No table is dropped or recreated.
--
-- All statements are idempotent (IF NOT EXISTS / DO $$ guards / CREATE OR REPLACE),
-- matching the house style established in migration 013.
--
-- NOTE on three failed runs of this migration, all now fixed below:
--
-- Run 1 failed on: notifications_student_action_id_fkey ("uuid vs text").
--   Cause: student_actions.id (like notifications.id and audit_logs.id) was
--   hand-created as `text` with a gen_random_uuid() default, not a true
--   `uuid` column. Fixed by Section 0-A.
--
-- Run 2 failed on: notifications_select_own_or_role_or_managers ("operator
--   does not exist: text = uuid"). Cause: notifications.user_id was *also*
--   hand-created as `text`, so the policy's `user_id = auth.uid()` comparison
--   doesn't type-check. Fixed by Section 0-B: the column itself is converted
--   to a real uuid (not a cast in the policy), matching how it's actually
--   used everywhere (profiles.id references, auth.uid() comparisons).
--   Checked first: all 20 existing notifications rows have user_id = NULL,
--   so this is lossless; the guard still aborts with a diagnostic instead of
--   silently corrupting data if a future run ever finds a non-UUID value.
--
-- Run 3 failed on: 42P01 "relation invalid_count does not exist", inside
--   Section 0-B's validation block. Cause: that block originally used a
--   two-target `SELECT count(*), string_agg(...) INTO invalid_count,
--   invalid_ids FROM ...`. Fixed by simplifying to a single-target
--   `SELECT count(*) INTO invalid_count FROM ...`, the same plain pattern
--   already proven to work elsewhere in this file (the trigger function's
--   `SELECT role INTO actor_role FROM public.profiles ...`, which compiled
--   cleanly in all three runs). The "which rows are invalid" detail is now a
--   copy-pasteable diagnostic query embedded in the RAISE EXCEPTION message
--   instead of a second aggregated INTO target.
--
-- All three failures rolled back their entire run (Supabase SQL Editor
-- executes the whole pasted script as one implicit transaction), so this
-- file is verified safe to run again from a totally clean slate — confirmed
-- via direct schema introspection after each failure: no run left any
-- partial changes behind. notifications.id and audit_logs.id are left as
-- `text` (untouched, not requested, and nothing in this migration compares
-- them against a uuid).

-- =========================================================================
-- 0-A) Fix student_actions.id to a true uuid column (see note above).
-- =========================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_actions' AND column_name = 'id' AND data_type <> 'uuid'
  ) THEN
    IF (SELECT count(*) FROM public.student_actions) > 0 THEN
      RAISE EXCEPTION 'student_actions has existing rows; refusing to auto-convert id to uuid — needs manual data migration first.';
    END IF;

    ALTER TABLE public.student_actions ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE public.student_actions ALTER COLUMN id TYPE uuid USING id::uuid;
    ALTER TABLE public.student_actions ALTER COLUMN id SET DEFAULT gen_random_uuid();
  END IF;
END$$;

-- =========================================================================
-- 0-B) Fix notifications.user_id to a true uuid column (see note above).
-- =========================================================================

DO $$
DECLARE
  invalid_count integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'user_id' AND data_type <> 'uuid'
  ) THEN
    invalid_count := 0;

    SELECT count(*) INTO invalid_count
    FROM public.notifications
    WHERE user_id IS NOT NULL
      AND user_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

    IF invalid_count > 0 THEN
      RAISE EXCEPTION 'notifications.user_id has % row(s) that are not valid UUIDs. Run this to see them: SELECT id, user_id FROM public.notifications WHERE user_id IS NOT NULL AND user_id !~ ''^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$''; — null them out or fix them manually before re-running this migration.', invalid_count;
    END IF;

    ALTER TABLE public.notifications ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
  END IF;
END$$;

-- =========================================================================
-- 1) student_actions: add columns needed by the new workflow
-- =========================================================================

ALTER TABLE public.student_actions ADD COLUMN IF NOT EXISTS requested_by uuid;
ALTER TABLE public.student_actions ADD COLUMN IF NOT EXISTS assigned_teacher_id uuid;
ALTER TABLE public.student_actions ADD COLUMN IF NOT EXISTS action_date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.student_actions ADD COLUMN IF NOT EXISTS action_time time NOT NULL DEFAULT CURRENT_TIME;
ALTER TABLE public.student_actions ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.student_actions ADD COLUMN IF NOT EXISTS completed_by uuid;
ALTER TABLE public.student_actions ADD COLUMN IF NOT EXISTS postponed_until timestamptz;
ALTER TABLE public.student_actions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Rename the old free-text "note" column to "notes" (matches the requested schema).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_actions' AND column_name = 'note'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_actions' AND column_name = 'notes'
  ) THEN
    ALTER TABLE public.student_actions RENAME COLUMN note TO notes;
  END IF;
END$$;

-- Drop the old free-text teacher/requester name columns: they're fully superseded by the
-- assigned_teacher_id / requested_by uuid references below (names are now always resolved
-- live from profiles via join, never stored/duplicated as stale text). Safe: 0 rows exist.
ALTER TABLE public.student_actions DROP COLUMN IF EXISTS teacher;
ALTER TABLE public.student_actions DROP COLUMN IF EXISTS requester;

-- requested_by / assigned_teacher_id are always supplied by the app; enforce NOT NULL now
-- that the columns exist (safe: table has 0 rows).
ALTER TABLE public.student_actions ALTER COLUMN requested_by SET NOT NULL;
ALTER TABLE public.student_actions ALTER COLUMN assigned_teacher_id SET NOT NULL;

-- =========================================================================
-- 2) Foreign keys
-- =========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'student_actions_student_id_fkey' AND t.relname = 'student_actions'
  ) THEN
    ALTER TABLE public.student_actions
      ADD CONSTRAINT student_actions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'student_actions_requested_by_fkey' AND t.relname = 'student_actions'
  ) THEN
    ALTER TABLE public.student_actions
      ADD CONSTRAINT student_actions_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(id);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'student_actions_assigned_teacher_id_fkey' AND t.relname = 'student_actions'
  ) THEN
    ALTER TABLE public.student_actions
      ADD CONSTRAINT student_actions_assigned_teacher_id_fkey FOREIGN KEY (assigned_teacher_id) REFERENCES public.profiles(id);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'student_actions_completed_by_fkey' AND t.relname = 'student_actions'
  ) THEN
    ALTER TABLE public.student_actions
      ADD CONSTRAINT student_actions_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.profiles(id);
  END IF;
END$$;

-- =========================================================================
-- 3) CHECK constraints for the value enums
--
-- NOTE (post-apply bug found during live testing): this table had a
-- hand-created `student_actions_status_check` constraint from before this
-- migration existed, enforcing the *old* app's vocabulary
-- (status IN ('pending','done','delayed')). The original version of this
-- section used `IF NOT EXISTS (... WHERE conname = ...)`, which correctly
-- avoided a duplicate-name error but, as a side effect, silently *kept* that
-- stale definition instead of updating it — so every UPDATE trying to set
-- status = 'completed'/'postponed'/'cancelled' failed with a CHECK violation
-- even though the migration had "succeeded". Fixed by switching to an
-- unconditional DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT, which always
-- converges to the intended definition regardless of what (if anything)
-- pre-existed under that name. Applied the same hardening to the type check
-- as a precaution, even though it was verified live to already have the
-- correct values.
-- =========================================================================

ALTER TABLE public.student_actions DROP CONSTRAINT IF EXISTS student_actions_type_check;
ALTER TABLE public.student_actions
  ADD CONSTRAINT student_actions_type_check CHECK (type IN ('summon', 'permission', 'entry'));

ALTER TABLE public.student_actions DROP CONSTRAINT IF EXISTS student_actions_status_check;
ALTER TABLE public.student_actions
  ADD CONSTRAINT student_actions_status_check CHECK (status IN ('pending', 'completed', 'postponed', 'cancelled'));

-- =========================================================================
-- 4) Indexes for the filters used by the action log
-- =========================================================================

CREATE INDEX IF NOT EXISTS student_actions_student_id_idx ON public.student_actions(student_id);
CREATE INDEX IF NOT EXISTS student_actions_assigned_teacher_id_idx ON public.student_actions(assigned_teacher_id);
CREATE INDEX IF NOT EXISTS student_actions_requested_by_idx ON public.student_actions(requested_by);
CREATE INDEX IF NOT EXISTS student_actions_status_idx ON public.student_actions(status);
CREATE INDEX IF NOT EXISTS student_actions_action_date_idx ON public.student_actions(action_date);
CREATE INDEX IF NOT EXISTS student_actions_grade_section_idx ON public.student_actions(grade, section);

-- =========================================================================
-- 5) updated_at trigger
-- =========================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_student_actions_updated_at ON public.student_actions;
CREATE TRIGGER trg_student_actions_updated_at
BEFORE UPDATE ON public.student_actions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 6) Column-level protection: a teacher may only flip status to
--    completed/postponed on their own assigned rows, and must not be able to
--    change the student, action type, reason, requester, or schedule fields
--    even though RLS (below) lets them UPDATE the row. RLS alone can't
--    restrict *which columns* change within an allowed row, so this is
--    enforced with a trigger.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.protect_student_action_teacher_update()
RETURNS trigger AS $$
DECLARE
  actor_role text;
BEGIN
  SELECT role INTO actor_role FROM public.profiles WHERE id = auth.uid();

  IF actor_role = 'teacher' THEN
    IF NEW.student_id IS DISTINCT FROM OLD.student_id
       OR NEW.student_name IS DISTINCT FROM OLD.student_name
       OR NEW.grade IS DISTINCT FROM OLD.grade
       OR NEW.section IS DISTINCT FROM OLD.section
       OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
       OR NEW.assigned_teacher_id IS DISTINCT FROM OLD.assigned_teacher_id
       OR NEW.action_date IS DISTINCT FROM OLD.action_date
       OR NEW.action_time IS DISTINCT FROM OLD.action_time
       OR NEW.lesson IS DISTINCT FROM OLD.lesson
    THEN
      RAISE EXCEPTION 'المعلم غير مصرح له بتعديل بيانات الطالب أو الإجراء، فقط تحديث الحالة (تم التنفيذ / تأجيل).';
    END IF;

    IF NEW.status NOT IN ('completed', 'postponed') THEN
      RAISE EXCEPTION 'المعلم يمكنه فقط تغيير الحالة إلى: تم التنفيذ أو تأجيل.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_student_action_teacher_update ON public.student_actions;
CREATE TRIGGER trg_protect_student_action_teacher_update
BEFORE UPDATE ON public.student_actions
FOR EACH ROW EXECUTE FUNCTION public.protect_student_action_teacher_update();

-- =========================================================================
-- 7) RLS: student_actions
-- =========================================================================

ALTER TABLE public.student_actions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'student_actions_select_managers' AND tablename = 'student_actions') THEN
    CREATE POLICY student_actions_select_managers ON public.student_actions
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'student_actions_select_assigned_teacher' AND tablename = 'student_actions') THEN
    CREATE POLICY student_actions_select_assigned_teacher ON public.student_actions
      FOR SELECT USING (assigned_teacher_id = auth.uid());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'student_actions_insert_managers' AND tablename = 'student_actions') THEN
    CREATE POLICY student_actions_insert_managers ON public.student_actions
      FOR INSERT WITH CHECK (
        requested_by = auth.uid()
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'student_actions_update_managers' AND tablename = 'student_actions') THEN
    CREATE POLICY student_actions_update_managers ON public.student_actions
      FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
      ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'student_actions_update_assigned_teacher' AND tablename = 'student_actions') THEN
    CREATE POLICY student_actions_update_assigned_teacher ON public.student_actions
      FOR UPDATE USING (assigned_teacher_id = auth.uid())
      WITH CHECK (assigned_teacher_id = auth.uid());
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'student_actions_delete_managers' AND tablename = 'student_actions') THEN
    CREATE POLICY student_actions_delete_managers ON public.student_actions
      FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
      );
  END IF;
END$$;

-- =========================================================================
-- 8) notifications: additive columns + RLS (table already exists live with
--    id, title, body, role, user_id, is_read, created_at, is_demo)
-- =========================================================================

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS student_action_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'notifications_student_action_id_fkey' AND t.relname = 'notifications'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_student_action_id_fkey FOREIGN KEY (student_action_id) REFERENCES public.student_actions(id) ON DELETE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_student_action_id_idx ON public.notifications(student_action_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notifications_select_own_or_role_or_managers' AND tablename = 'notifications') THEN
    CREATE POLICY notifications_select_own_or_role_or_managers ON public.notifications
      FOR SELECT USING (
        user_id = auth.uid()
        OR (user_id IS NULL AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()))
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notifications_insert_authenticated_staff' AND tablename = 'notifications') THEN
    CREATE POLICY notifications_insert_authenticated_staff ON public.notifications
      FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal', 'teacher'))
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notifications_update_own' AND tablename = 'notifications') THEN
    CREATE POLICY notifications_update_own ON public.notifications
      FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END$$;

-- =========================================================================
-- 9) audit_logs: additive columns + RLS (table already exists live with
--    id, actor_name, actor_role, action, details, created_at)
-- =========================================================================

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS student_id text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS student_action_id uuid;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_values jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_values jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'audit_logs_student_action_id_fkey' AND t.relname = 'audit_logs'
  ) THEN
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT audit_logs_student_action_id_fkey FOREIGN KEY (student_action_id) REFERENCES public.student_actions(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS audit_logs_student_action_id_idx ON public.audit_logs(student_action_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_id_idx ON public.audit_logs(actor_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Read access restricted to managers only (audit trail is sensitive).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'audit_logs_select_managers' AND tablename = 'audit_logs') THEN
    CREATE POLICY audit_logs_select_managers ON public.audit_logs
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
      );
  END IF;
END$$;

-- Any staff member (manager or teacher) may write an entry, but only attributed to themselves.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'audit_logs_insert_self_attributed' AND tablename = 'audit_logs') THEN
    CREATE POLICY audit_logs_insert_self_attributed ON public.audit_logs
      FOR INSERT WITH CHECK (
        actor_id = auth.uid()
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal', 'teacher'))
      );
  END IF;
END$$;

-- No UPDATE/DELETE policy: audit_logs is append-only by design.
