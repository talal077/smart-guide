-- First-run School Setup Wizard: school-identity data (education administration, school
-- name, stage, academic year) plus the reference lists it depends on. Everything the UI
-- needs is stored here so no school-specific or curriculum data is hardcoded in the app.
--
-- Tables:
--   school_stages             reference list: ابتدائي / متوسط / ثانوي
--   grade_levels              reference list: grade names per stage
--   education_administrations reference list: Saudi education administrations (by region)
--   academic_years            reference list: selectable Hijri academic years
--   school_settings           singleton row holding the school's actual setup data
--
-- school_settings is enforced as a true singleton via a boolean primary key that can only
-- ever hold the value `true` (CHECK (id)), so a second row can never be inserted.

CREATE TABLE IF NOT EXISTS public.school_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.grade_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES public.school_stages(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'grade_levels_stage_name_unique' AND t.relname = 'grade_levels'
  ) THEN
    ALTER TABLE public.grade_levels ADD CONSTRAINT grade_levels_stage_name_unique UNIQUE (stage_id, name);
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.education_administrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.school_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  education_administration_id uuid NOT NULL REFERENCES public.education_administrations(id),
  school_name text NOT NULL,
  stage_id uuid NOT NULL REFERENCES public.school_stages(id),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed reference data (no-ops on rerun thanks to ON CONFLICT DO NOTHING).

INSERT INTO public.school_stages (name, sort_order) VALUES
  ('ابتدائي', 1),
  ('متوسط', 2),
  ('ثانوي', 3)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.grade_levels (stage_id, name, sort_order)
SELECT s.id, g.name, g.sort_order
FROM public.school_stages s
JOIN (VALUES
  ('ابتدائي', 'الأول الابتدائي', 1),
  ('ابتدائي', 'الثاني الابتدائي', 2),
  ('ابتدائي', 'الثالث الابتدائي', 3),
  ('ابتدائي', 'الرابع الابتدائي', 4),
  ('ابتدائي', 'الخامس الابتدائي', 5),
  ('ابتدائي', 'السادس الابتدائي', 6),
  ('متوسط', 'الأول متوسط', 1),
  ('متوسط', 'الثاني متوسط', 2),
  ('متوسط', 'الثالث متوسط', 3),
  ('ثانوي', 'الأول ثانوي', 1),
  ('ثانوي', 'الثاني ثانوي', 2),
  ('ثانوي', 'الثالث ثانوي', 3)
) AS g(stage_name, name, sort_order) ON g.stage_name = s.name
ON CONFLICT (stage_id, name) DO NOTHING;

INSERT INTO public.education_administrations (name, sort_order) VALUES
  ('إدارة تعليم منطقة الرياض', 1),
  ('إدارة تعليم منطقة مكة المكرمة', 2),
  ('إدارة تعليم منطقة المدينة المنورة', 3),
  ('إدارة تعليم المنطقة الشرقية', 4),
  ('إدارة تعليم منطقة القصيم', 5),
  ('إدارة تعليم منطقة عسير', 6),
  ('إدارة تعليم منطقة تبوك', 7),
  ('إدارة تعليم منطقة حائل', 8),
  ('إدارة تعليم منطقة الحدود الشمالية', 9),
  ('إدارة تعليم منطقة جازان', 10),
  ('إدارة تعليم منطقة نجران', 11),
  ('إدارة تعليم منطقة الباحة', 12),
  ('إدارة تعليم منطقة الجوف', 13)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.academic_years (label, sort_order) VALUES
  ('1445هـ', 1),
  ('1446هـ', 2),
  ('1447هـ', 3),
  ('1448هـ', 4),
  ('1449هـ', 5),
  ('1450هـ', 6),
  ('1451هـ', 7),
  ('1452هـ', 8)
ON CONFLICT (label) DO NOTHING;

-- Row Level Security

ALTER TABLE public.school_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_administrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'school_stages_select_authenticated' AND tablename = 'school_stages') THEN
    CREATE POLICY school_stages_select_authenticated ON public.school_stages
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'grade_levels_select_authenticated' AND tablename = 'grade_levels') THEN
    CREATE POLICY grade_levels_select_authenticated ON public.grade_levels
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'education_administrations_select_authenticated' AND tablename = 'education_administrations') THEN
    CREATE POLICY education_administrations_select_authenticated ON public.education_administrations
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'academic_years_select_authenticated' AND tablename = 'academic_years') THEN
    CREATE POLICY academic_years_select_authenticated ON public.academic_years
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'school_settings_select_authenticated' AND tablename = 'school_settings') THEN
    CREATE POLICY school_settings_select_authenticated ON public.school_settings
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

-- Only principal/admin may run the setup wizard and later edit school data from Settings.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'school_settings_insert_managers' AND tablename = 'school_settings') THEN
    CREATE POLICY school_settings_insert_managers ON public.school_settings
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin')
        )
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'school_settings_update_managers' AND tablename = 'school_settings') THEN
    CREATE POLICY school_settings_update_managers ON public.school_settings
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin')
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.role IN ('principal', 'admin')
        )
      );
  END IF;
END$$;

-- Keep updated_at current on every edit from the Settings page.
CREATE OR REPLACE FUNCTION public.set_school_settings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_school_settings_updated_at ON public.school_settings;
CREATE TRIGGER trg_school_settings_updated_at
  BEFORE UPDATE ON public.school_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_school_settings_updated_at();
