-- OPTIONAL, standalone seed script -- NOT a schema migration (no DDL, no table/column
-- changes). Creates one persistent, clearly-labeled real test teacher (with a real
-- subject/grade/section assignment and 5 real students) so "صفحة تحضير الحصص" can be
-- exercised manually with real Supabase data instead of any client-side mock array.
-- Every row this script inserts has is_demo = true (the same flag the app's own
-- /api/demo/generate feature uses) so it stays easy to find and remove later:
--
--   delete from public.attendance_records where teacher_id = '<TEACHER_AUTH_USER_ID>';
--   delete from public.lesson_submissions where teacher_id = '<TEACHER_AUTH_USER_ID>';
--   delete from public.class_schedule where teacher_id = '<TEACHER_AUTH_USER_ID>';
--   delete from public.teacher_assignments where teacher_id = '<TEACHER_AUTH_USER_ID>';
--   delete from public.students where grade = 'الأول ثانوي' and section = 'تجريبي';
--   delete from public.profiles where id = '<TEACHER_AUTH_USER_ID>';
--   -- then delete the auth user itself from Authentication > Users in the dashboard.
--
-- WHY this is a script you run yourself, not something applied automatically: creating
-- the auth.users row requires Supabase's own Auth (GoTrue) machinery (password hashing,
-- the identities table, etc.) -- there is no safe, supported way to INSERT directly into
-- auth.users via plain SQL. This script only covers the public-schema rows; the auth
-- user itself must be created first, one of two ways:
--
--   Option A (recommended, fastest): Supabase Dashboard -> Authentication -> Users ->
--     "Add user" -> email: demo.teacher@smartguide.local, set any password, confirm the
--     email immediately (toggle "Auto Confirm User"). Copy the generated user UUID.
--
--   Option B: open the app's own /login page -> "تسجيل أول دخول" -> role "معلم" -> fill
--     in the same email/a password of your choice -> "إنشاء الحساب". Then find the new
--     user's UUID under Authentication > Users in the dashboard.
--
-- Once you have that UUID, replace every occurrence of the placeholder
-- '00000000-0000-0000-0000-000000000000' below with it, then run this whole file once
-- in the SQL Editor. Every statement is idempotent (ON CONFLICT / delete-then-insert),
-- so re-running it after editing the placeholder, or re-running it unchanged, is safe.

-- =========================================================================
-- 0) Fill in the real teacher UUID here once (from Option A or B above), then this
--    single value drives every insert below.
--
--    NOTE: the PL/pgSQL variables below are deliberately prefixed v_ (v_teacher_id,
--    v_subject_id) rather than named teacher_id/subject_id -- those exact names are
--    also real column names on teacher_assignments/class_schedule, and an unprefixed
--    local variable with the same name as a column makes `WHERE teacher_id = teacher_id`
--    ambiguous (Postgres resolves it against the column, not the variable, so it would
--    silently become a no-op `WHERE teacher_id = teacher_id` self-comparison instead of
--    filtering by the intended value).
-- =========================================================================
DO $$
DECLARE
  v_teacher_id uuid := '00000000-0000-0000-0000-000000000000'; -- <-- REPLACE THIS
  v_subject_id uuid;
  v_grade text := 'الأول ثانوي';
  v_section text := 'تجريبي';
  v_today_riyadh date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
  v_day_name text;
BEGIN
  IF v_teacher_id = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'Replace the v_teacher_id placeholder at the top of this script with the real auth.users UUID before running it (see the comment block above).';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_teacher_id) THEN
    RAISE EXCEPTION 'No auth.users row found for id %. Create the teacher account first (see the comment block above).', v_teacher_id;
  END IF;

  -- 1) profiles: mark them role = teacher, active, not blocked.
  INSERT INTO public.profiles (id, full_name, role, is_active, is_blocked, is_demo, created_at, updated_at)
  VALUES (v_teacher_id, 'معلم اختبار حقيقي (Demo Teacher)', 'teacher', true, false, true, now(), now())
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = 'teacher',
    is_active = true,
    is_blocked = false,
    is_demo = true,
    updated_at = now();

  -- 2) sections: add the isolated test section if it doesn't already exist (does not
  --    touch or reorder any real section).
  INSERT INTO public.sections (name, sort_order, is_demo)
  VALUES (v_section, 99, true)
  ON CONFLICT (name) DO NOTHING;

  -- 3) subjects: reuse a real subject row (كيمياء) rather than creating a duplicate.
  --    Change the subject name below if your school doesn't have this exact subject.
  SELECT id INTO v_subject_id FROM public.subjects WHERE name = 'كيمياء' LIMIT 1;
  IF v_subject_id IS NULL THEN
    RAISE EXCEPTION 'No subject named "كيمياء" found in public.subjects -- edit this script to reference a real subject name that exists in your school''s data.';
  END IF;

  -- 4) teacher_assignments: link the teacher to that real subject/grade/section.
  DELETE FROM public.teacher_assignments WHERE teacher_id = v_teacher_id;
  INSERT INTO public.teacher_assignments (teacher_id, subject_id, grade, section, is_demo)
  VALUES (v_teacher_id, v_subject_id, v_grade, v_section, true);

  -- 5) students: 5 real rows in public.students, isolated to the test section so they
  --    never mix with a real class roster.
  DELETE FROM public.students WHERE grade = v_grade AND section = v_section;
  INSERT INTO public.students (id, full_name, grade, section, entry_code, is_demo)
  SELECT gen_random_uuid(), 'طالب اختبار ' || n, v_grade, v_section, NULL, true
  FROM generate_series(1, 5) AS n;

  -- 6) class_schedule: one real (is_demo-flagged) row linking teacher+subject+grade+
  --    section+period, per the task's request for "حصة أو جدول حقيقي". Note: the
  --    /attendance page itself does not read this table today (its "lesson" concept is
  --    a fixed 7-period list, not schedule-driven) -- this row is provided for
  --    completeness/other modules that do read class_schedule (e.g. analytics), not
  --    because attendance retrieval depends on it.
  v_day_name := (ARRAY['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'])[1 + (extract(dow from v_today_riyadh)::int % 5)];
  DELETE FROM public.class_schedule WHERE teacher_id = v_teacher_id;
  INSERT INTO public.class_schedule (day_of_week, period, grade, section, subject_id, teacher_id, is_demo)
  VALUES (v_day_name, 1, v_grade, v_section, v_subject_id, v_teacher_id, true);

  RAISE NOTICE 'Seed complete: teacher %, subject %, class % / %, 5 students.', v_teacher_id, v_subject_id, v_grade, v_section;
END$$;
