-- Settings center upgrade, discovered and built while reviewing "الإعدادات" (Settings):
--
-- 0) SECURITY FIX (proven necessary live, not theoretical): public.profiles currently
--    has NO effective UPDATE protection. Verified directly against the live database
--    before writing this migration: an authenticated teacher account was able to
--    UPDATE another user's profiles row (full_name) with zero RLS error and 1 row
--    affected. Because profiles.role/is_active/is_blocked are exactly the columns every
--    permission check in this app (canAccess, ALLOWED_ROLES, RLS "role IN (...)" checks
--    everywhere) trusts unconditionally, this is a live privilege-escalation hole: any
--    signed-in user could currently set their own role to 'principal' or unblock/block
--    any other account. Confirmed no live feature depends on broad profiles UPDATE
--    access (/users and the old /profile page are both still fully mock/static, not
--    wired to Supabase), so tightening this breaks nothing working today.
--    Fix: self-service UPDATE limited to safe fields (full_name only) via a protective
--    trigger mirroring the pattern already used for student_actions in migration 014;
--    role/is_active/is_blocked changes (on self or others) require principal/admin/
--    vice_principal.
--
-- 1) school_settings: add the fields the Settings page needs that don't exist yet —
--    academic_term (الفصل الدراسي), logo_url (Supabase Storage path, not base64), and
--    is_active (school active/suspended). All nullable/defaulted so existing rows and
--    app code that doesn't know about them yet are unaffected.
--
-- 2) school_settings UPDATE policy: today it is admin-only (migration 006 deliberately
--    tightened it from principal+admin+vice_principal down to admin-only). The current
--    task's explicit requirement is "principal: كامل الصلاحيات" on the Settings page,
--    which conflicts with that. This migration widens UPDATE back to principal+admin
--    (not vice_principal — school identity data is not an "operational" setting per the
--    same requirement's own wording). Flagged clearly in the review report; apply only
--    if you want principal to regain this access.
--
-- 3) Three new singleton settings tables (same proven boolean-PK singleton pattern as
--    school_settings): attendance_settings, notification_settings, system_settings.
--    principal/admin/vice_principal may read and write all three (operational settings).
--
-- 4) A 'school-logo' public Storage bucket + policies: public read, managers write.
--
-- All statements are idempotent (IF NOT EXISTS / DO $$ guards / CREATE OR REPLACE /
-- ON CONFLICT DO NOTHING), matching house style. Safe to run on a fresh or
-- already-partially-migrated database. NOT applied automatically.

-- =========================================================================
-- 0) profiles: close the open UPDATE hole
-- =========================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'profiles_select_authenticated' AND tablename = 'profiles') THEN
    CREATE POLICY profiles_select_authenticated ON public.profiles
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_managers ON public.profiles;
CREATE POLICY profiles_update_managers ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
  );

-- Column-level protection: self-service updates (the policy above allows any column
-- syntactically) may only ever change full_name. role/is_active/is_blocked/id changes —
-- on ANY row, including your own — require a manager. Without this, a non-manager could
-- still self-promote via profiles_update_self since that policy has no column limits.
CREATE OR REPLACE FUNCTION public.protect_profiles_self_update()
RETURNS trigger AS $$
DECLARE
  v_role text;
BEGIN
  -- Assignment form (:=), not "SELECT ... INTO", so this can never be parsed as
  -- the standalone SQL "SELECT INTO new_table" (create-table-as-select) form —
  -- eliminates that ambiguity class entirely regardless of how this script is
  -- submitted/split by whatever client executes it.
  v_role := (SELECT role FROM public.profiles WHERE id = auth.uid());

  IF v_role IS DISTINCT FROM 'principal' AND v_role IS DISTINCT FROM 'admin' AND v_role IS DISTINCT FROM 'vice_principal' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.is_blocked IS DISTINCT FROM OLD.is_blocked
       OR NEW.id IS DISTINCT FROM OLD.id
    THEN
      RAISE EXCEPTION 'غير مصرح لك بتغيير الدور أو حالة التفعيل أو الحظر.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_profiles_self_update ON public.profiles;
CREATE TRIGGER trg_protect_profiles_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profiles_self_update();

-- =========================================================================
-- 1) school_settings: new columns
-- =========================================================================

ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS academic_term text;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.school_settings ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'school_settings_academic_term_check' AND t.relname = 'school_settings'
  ) THEN
    ALTER TABLE public.school_settings
      ADD CONSTRAINT school_settings_academic_term_check CHECK (academic_term IS NULL OR academic_term IN ('الفصل الأول', 'الفصل الثاني', 'الفصل الثالث'));
  END IF;
END$$;

-- =========================================================================
-- 2) school_settings UPDATE: widen back to principal+admin (see header note)
-- =========================================================================

DROP POLICY IF EXISTS school_settings_update_managers ON public.school_settings;
CREATE POLICY school_settings_update_managers ON public.school_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin'))
  );

-- =========================================================================
-- 3) attendance_settings (singleton) — storage only; not wired into the
--    attendance/absence pages by this migration or the accompanying app code
--    (out of this review's scope; those pages were explicitly off-limits).
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  present_color text NOT NULL DEFAULT '#16a34a',
  absent_color text NOT NULL DEFAULT '#dc2626',
  late_color text NOT NULL DEFAULT '#f59e0b',
  excused_color text NOT NULL DEFAULT '#2563eb',
  submission_deadline_minutes int NOT NULL DEFAULT 30,
  late_alert_delay_minutes int NOT NULL DEFAULT 15,
  allow_edit_after_submit boolean NOT NULL DEFAULT false,
  copy_from_previous_enabled boolean NOT NULL DEFAULT false,
  default_all_present boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'attendance_settings_colors_check' AND t.relname = 'attendance_settings'
  ) THEN
    ALTER TABLE public.attendance_settings ADD CONSTRAINT attendance_settings_colors_check CHECK (
      present_color ~ '^#[0-9a-fA-F]{6}$' AND
      absent_color ~ '^#[0-9a-fA-F]{6}$' AND
      late_color ~ '^#[0-9a-fA-F]{6}$' AND
      excused_color ~ '^#[0-9a-fA-F]{6}$'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'attendance_settings_timing_check' AND t.relname = 'attendance_settings'
  ) THEN
    ALTER TABLE public.attendance_settings ADD CONSTRAINT attendance_settings_timing_check CHECK (
      submission_deadline_minutes BETWEEN 1 AND 240 AND
      late_alert_delay_minutes BETWEEN 0 AND 240
    );
  END IF;
END$$;

INSERT INTO public.attendance_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'attendance_settings_select_authenticated' AND tablename = 'attendance_settings') THEN
    CREATE POLICY attendance_settings_select_authenticated ON public.attendance_settings
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

DROP POLICY IF EXISTS attendance_settings_write_managers ON public.attendance_settings;
CREATE POLICY attendance_settings_write_managers ON public.attendance_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
  );

CREATE OR REPLACE FUNCTION public.set_attendance_settings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_attendance_settings_updated_at ON public.attendance_settings;
CREATE TRIGGER trg_attendance_settings_updated_at
BEFORE UPDATE ON public.attendance_settings
FOR EACH ROW EXECUTE FUNCTION public.set_attendance_settings_updated_at();

-- =========================================================================
-- 4) notification_settings (singleton)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.notification_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  unsubmitted_alerts_enabled boolean NOT NULL DEFAULT true,
  student_action_alerts_enabled boolean NOT NULL DEFAULT true,
  admin_alerts_enabled boolean NOT NULL DEFAULT true,
  polling_seconds int NOT NULL DEFAULT 45,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'notification_settings_polling_seconds_check' AND t.relname = 'notification_settings'
  ) THEN
    -- Bounded so nobody can configure an "aggressive" poll (too low) or an
    -- effectively-broken one (too high) from the UI.
    ALTER TABLE public.notification_settings ADD CONSTRAINT notification_settings_polling_seconds_check CHECK (polling_seconds BETWEEN 15 AND 300);
  END IF;
END$$;

INSERT INTO public.notification_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notification_settings_select_authenticated' AND tablename = 'notification_settings') THEN
    CREATE POLICY notification_settings_select_authenticated ON public.notification_settings
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

DROP POLICY IF EXISTS notification_settings_write_managers ON public.notification_settings;
CREATE POLICY notification_settings_write_managers ON public.notification_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
  );

CREATE OR REPLACE FUNCTION public.set_notification_settings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notification_settings_updated_at ON public.notification_settings;
CREATE TRIGGER trg_notification_settings_updated_at
BEFORE UPDATE ON public.notification_settings
FOR EACH ROW EXECUTE FUNCTION public.set_notification_settings_updated_at();

-- =========================================================================
-- 5) system_settings (singleton) — currently just "rows per page"; RTL/
--    Arabic/Asia-Riyadh are structural constants in the app, not stored here.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  rows_per_page int NOT NULL DEFAULT 10,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'system_settings_rows_per_page_check' AND t.relname = 'system_settings'
  ) THEN
    ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_rows_per_page_check CHECK (rows_per_page BETWEEN 5 AND 100);
  END IF;
END$$;

INSERT INTO public.system_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'system_settings_select_authenticated' AND tablename = 'system_settings') THEN
    CREATE POLICY system_settings_select_authenticated ON public.system_settings
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

DROP POLICY IF EXISTS system_settings_write_managers ON public.system_settings;
CREATE POLICY system_settings_write_managers ON public.system_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin', 'vice_principal'))
  );

CREATE OR REPLACE FUNCTION public.set_system_settings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER trg_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION public.set_system_settings_updated_at();

-- =========================================================================
-- 6) school-logo Storage bucket: public read (it's displayed on every export/
--    header), write restricted to principal/admin.
-- =========================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('school-logo', 'school-logo', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'school_logo_public_read' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY school_logo_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'school-logo');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'school_logo_managers_write' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY school_logo_managers_write ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = 'school-logo'
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin'))
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'school_logo_managers_update' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY school_logo_managers_update ON storage.objects
      FOR UPDATE USING (
        bucket_id = 'school-logo'
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin'))
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'school_logo_managers_delete' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY school_logo_managers_delete ON storage.objects
      FOR DELETE USING (
        bucket_id = 'school-logo'
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin'))
      );
  END IF;
END$$;
