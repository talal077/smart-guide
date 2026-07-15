-- Aggregate (server-side GROUP BY) functions backing the "التقارير والإحصائيات"
-- (Reports & Statistics) page. Additive only: no existing table, column, or policy
-- is touched. All functions are STABLE / LANGUAGE plpgsql with the default
-- SECURITY INVOKER, so the same RLS policies that already govern direct table
-- access (see migrations 001-014: "auth.uid() IS NOT NULL" on students,
-- attendance_records, subjects, lesson_submissions, profiles) apply unchanged
-- when called via supabase.rpc(...). No SECURITY DEFINER is used anywhere here.
--
-- Every filter parameter defaults to NULL, meaning "no filter" -- callers only
-- pass the filters currently selected on the Reports page. Aggregation (COUNT,
-- GROUP BY, window functions) happens in Postgres so the client never downloads
-- full attendance_records rows just to compute a total.
--
-- IMPORTANT -- schema drift discovered live (first apply attempt failed with
-- "42883: operator does not exist: text >= date"): unlike what migrations
-- 002/003/012 declare, public.attendance_records.date is actually `text` in
-- production, not `date` (same kind of pre-existing-table drift already
-- documented in migration 013's notes for RLS policies/unique constraints).
-- Verified directly via the PostgREST OpenAPI schema (GET /rest/v1/) and a
-- full-table scan for non-ISO values, same technique migration 014 used:
--   - attendance_records.date  -> format "text"  (21,562 rows checked: 0 NULL,
--     0 empty string, 0 rows failing ^[0-9]{4}-[0-9]{2}-[0-9]{2}$)
--   - lesson_submissions.date  -> format "date" (a real date column -- no cast
--     needed for the one function below that filters on it)
-- Every place below that compares/groups on attendance_records.date now goes
-- through NULLIF(ar.date, '')::date, and every function that touches that
-- column calls reports_assert_attendance_dates_valid() first, which raises a
-- clear diagnostic instead of a raw cast error if any future row is ever
-- non-ISO. See migration 016 for an *optional*, separate, idempotent
-- migration that permanently converts the column to a native `date` type --
-- it is not required for the functions below to work correctly.
--
-- SECOND drift found after the first apply "succeeded" (CREATE FUNCTION does
-- not fully type-check a plpgsql body, so this only surfaced when
-- reports_students_table was actually called): attendance_records.id AND
-- attendance_records.student_id are ALSO `text` live, not `uuid` -- confirmed
-- the same way, via the OpenAPI schema. reports_students_table's RETURNS
-- TABLE originally declared `student_id uuid`, which fails at call time with
-- "42804: Returned type text does not match expected type uuid in column 1".
-- Fixed by declaring that output column `text` (matching the real column
-- type) -- nothing else in this file compares student_id against a uuid
-- parameter, so no other function needed a change for this.
--
-- THIRD issue (this file's second apply attempt): "42P13: cannot change
-- return type of existing function ... Row type defined by OUT parameters is
-- different." Postgres's CREATE OR REPLACE FUNCTION refuses to change a
-- RETURNS TABLE (OUT-parameter) signature in place -- exactly what the
-- student_id uuid -> text fix above needed to do. Every function in this file
-- is now preceded by a matching DROP FUNCTION IF EXISTS with its exact
-- parameter-type signature, so this file can always be re-run wholesale after
-- any future column/type fix without hand-picking which function changed --
-- this is also what "safe to rerun after rollback" requires.

-- =========================================================================
-- 0) reports_assert_attendance_dates_valid: shared guard called by every
--    function below that reads attendance_records.date. Fails loud with a
--    copy-pasteable diagnostic query instead of letting a bad row surface as
--    an opaque cast error deep inside an aggregate.
-- =========================================================================
DROP FUNCTION IF EXISTS public.reports_assert_attendance_dates_valid();
CREATE OR REPLACE FUNCTION public.reports_assert_attendance_dates_valid()
RETURNS void
LANGUAGE plpgsql STABLE AS $$
DECLARE
  bad_count integer;
BEGIN
  SELECT count(*) INTO bad_count
  FROM public.attendance_records
  WHERE date IS NOT NULL
    AND date <> ''
    AND date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'attendance_records.date has % row(s) that are not a valid ISO date (YYYY-MM-DD) and cannot be safely used by the reports RPC functions. Inspect them with: SELECT id, date FROM public.attendance_records WHERE date IS NOT NULL AND date <> '''' AND date !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' LIMIT 20;',
      bad_count;
  END IF;
END;
$$;

-- =========================================================================
-- 1) reports_summary: KPI cards (total students, present/absent/late/excused,
--    attendance rate, absence rate) for the current filter set.
-- =========================================================================
DROP FUNCTION IF EXISTS public.reports_summary(date, date, text, text, uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.reports_summary(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_grade text DEFAULT NULL,
  p_section text DEFAULT NULL,
  p_subject_id uuid DEFAULT NULL,
  p_teacher_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS TABLE (
  total_students bigint,
  present_count bigint,
  absent_count bigint,
  late_count bigint,
  excused_count bigint,
  total_records bigint,
  attendance_rate numeric,
  absence_rate numeric
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  PERFORM public.reports_assert_attendance_dates_valid();

  RETURN QUERY
  WITH student_totals AS (
    SELECT count(*) AS c
    FROM public.students s
    WHERE (p_grade IS NULL OR s.grade = p_grade)
      AND (p_section IS NULL OR s.section = p_section)
  ),
  attendance_totals AS (
    SELECT
      count(*) FILTER (WHERE ar.status = 'present') AS present_c,
      count(*) FILTER (WHERE ar.status = 'absent') AS absent_c,
      count(*) FILTER (WHERE ar.status = 'late') AS late_c,
      count(*) FILTER (WHERE ar.status = 'excused') AS excused_c,
      count(*) AS total_c
    FROM public.attendance_records ar
    WHERE (p_date_from IS NULL OR NULLIF(ar.date, '')::date >= p_date_from)
      AND (p_date_to IS NULL OR NULLIF(ar.date, '')::date <= p_date_to)
      AND (p_grade IS NULL OR ar.grade = p_grade)
      AND (p_section IS NULL OR ar.section = p_section)
      AND (p_subject_id IS NULL OR ar.subject_id = p_subject_id)
      AND (p_teacher_id IS NULL OR ar.teacher_id = p_teacher_id)
      AND (p_status IS NULL OR ar.status = p_status)
  )
  SELECT
    student_totals.c,
    attendance_totals.present_c,
    attendance_totals.absent_c,
    attendance_totals.late_c,
    attendance_totals.excused_c,
    attendance_totals.total_c,
    CASE WHEN attendance_totals.total_c > 0
      THEN round(attendance_totals.present_c::numeric / attendance_totals.total_c * 100, 1)
      ELSE 0 END,
    CASE WHEN attendance_totals.total_c > 0
      THEN round(attendance_totals.absent_c::numeric / attendance_totals.total_c * 100, 1)
      ELSE 0 END
  FROM student_totals, attendance_totals;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reports_summary(date, date, text, text, uuid, uuid, text) TO authenticated;

-- =========================================================================
-- 2) reports_daily_attendance: one row per day in range, for the "attendance
--    over the days" chart.
-- =========================================================================
DROP FUNCTION IF EXISTS public.reports_daily_attendance(date, date, text, text, uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.reports_daily_attendance(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_grade text DEFAULT NULL,
  p_section text DEFAULT NULL,
  p_subject_id uuid DEFAULT NULL,
  p_teacher_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS TABLE (
  day date,
  present_count bigint,
  absent_count bigint,
  late_count bigint,
  excused_count bigint,
  total_count bigint
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  PERFORM public.reports_assert_attendance_dates_valid();

  RETURN QUERY
  SELECT
    NULLIF(ar.date, '')::date AS day,
    count(*) FILTER (WHERE ar.status = 'present'),
    count(*) FILTER (WHERE ar.status = 'absent'),
    count(*) FILTER (WHERE ar.status = 'late'),
    count(*) FILTER (WHERE ar.status = 'excused'),
    count(*)
  FROM public.attendance_records ar
  WHERE ar.date IS NOT NULL AND ar.date <> ''
    AND (p_date_from IS NULL OR NULLIF(ar.date, '')::date >= p_date_from)
    AND (p_date_to IS NULL OR NULLIF(ar.date, '')::date <= p_date_to)
    AND (p_grade IS NULL OR ar.grade = p_grade)
    AND (p_section IS NULL OR ar.section = p_section)
    AND (p_subject_id IS NULL OR ar.subject_id = p_subject_id)
    AND (p_teacher_id IS NULL OR ar.teacher_id = p_teacher_id)
    AND (p_status IS NULL OR ar.status = p_status)
  GROUP BY NULLIF(ar.date, '')::date
  ORDER BY NULLIF(ar.date, '')::date;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reports_daily_attendance(date, date, text, text, uuid, uuid, text) TO authenticated;

-- =========================================================================
-- 3) reports_top_absent_grades: grades ranked by absence count/rate.
-- =========================================================================
DROP FUNCTION IF EXISTS public.reports_top_absent_grades(date, date, text, text, uuid, uuid, text, int);
CREATE OR REPLACE FUNCTION public.reports_top_absent_grades(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_grade text DEFAULT NULL,
  p_section text DEFAULT NULL,
  p_subject_id uuid DEFAULT NULL,
  p_teacher_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  grade text,
  absent_count bigint,
  total_count bigint,
  absence_rate numeric
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  PERFORM public.reports_assert_attendance_dates_valid();

  RETURN QUERY
  SELECT
    ar.grade,
    count(*) FILTER (WHERE ar.status = 'absent') AS absent_count,
    count(*) AS total_count,
    CASE WHEN count(*) > 0
      THEN round(count(*) FILTER (WHERE ar.status = 'absent')::numeric / count(*) * 100, 1)
      ELSE 0 END AS absence_rate
  FROM public.attendance_records ar
  WHERE ar.grade IS NOT NULL
    AND (p_date_from IS NULL OR NULLIF(ar.date, '')::date >= p_date_from)
    AND (p_date_to IS NULL OR NULLIF(ar.date, '')::date <= p_date_to)
    AND (p_grade IS NULL OR ar.grade = p_grade)
    AND (p_section IS NULL OR ar.section = p_section)
    AND (p_subject_id IS NULL OR ar.subject_id = p_subject_id)
    AND (p_teacher_id IS NULL OR ar.teacher_id = p_teacher_id)
    AND (p_status IS NULL OR ar.status = p_status)
  GROUP BY ar.grade
  ORDER BY absent_count DESC, ar.grade
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reports_top_absent_grades(date, date, text, text, uuid, uuid, text, int) TO authenticated;

-- =========================================================================
-- 4) reports_top_committed_sections: grade+section ranked by commitment
--    (present / total) rate, highest first.
-- =========================================================================
DROP FUNCTION IF EXISTS public.reports_top_committed_sections(date, date, text, text, uuid, uuid, text, int);
CREATE OR REPLACE FUNCTION public.reports_top_committed_sections(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_grade text DEFAULT NULL,
  p_section text DEFAULT NULL,
  p_subject_id uuid DEFAULT NULL,
  p_teacher_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  grade text,
  section text,
  present_count bigint,
  total_count bigint,
  commitment_rate numeric
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  PERFORM public.reports_assert_attendance_dates_valid();

  RETURN QUERY
  SELECT
    ar.grade,
    ar.section,
    count(*) FILTER (WHERE ar.status = 'present') AS present_count,
    count(*) AS total_count,
    CASE WHEN count(*) > 0
      THEN round(count(*) FILTER (WHERE ar.status = 'present')::numeric / count(*) * 100, 1)
      ELSE 0 END AS commitment_rate
  FROM public.attendance_records ar
  WHERE ar.grade IS NOT NULL AND ar.section IS NOT NULL
    AND (p_date_from IS NULL OR NULLIF(ar.date, '')::date >= p_date_from)
    AND (p_date_to IS NULL OR NULLIF(ar.date, '')::date <= p_date_to)
    AND (p_grade IS NULL OR ar.grade = p_grade)
    AND (p_section IS NULL OR ar.section = p_section)
    AND (p_subject_id IS NULL OR ar.subject_id = p_subject_id)
    AND (p_teacher_id IS NULL OR ar.teacher_id = p_teacher_id)
    AND (p_status IS NULL OR ar.status = p_status)
  GROUP BY ar.grade, ar.section
  HAVING count(*) > 0
  ORDER BY commitment_rate DESC, total_count DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reports_top_committed_sections(date, date, text, text, uuid, uuid, text, int) TO authenticated;

-- =========================================================================
-- 5) reports_top_teacher_submissions: teachers ranked by lesson_submissions
--    submitted (uploaded) count, joined to profiles for the display name.
--    lesson_submissions.date is a genuine `date` column live (verified via
--    the PostgREST OpenAPI schema: format "date", not "text"), so no cast or
--    guard is needed here -- only attendance_records.date has the drift.
-- =========================================================================
DROP FUNCTION IF EXISTS public.reports_top_teacher_submissions(date, date, text, text, uuid, int);
CREATE OR REPLACE FUNCTION public.reports_top_teacher_submissions(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_grade text DEFAULT NULL,
  p_section text DEFAULT NULL,
  p_subject_id uuid DEFAULT NULL,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  teacher_id uuid,
  teacher_name text,
  submitted_count bigint,
  total_count bigint,
  submission_rate numeric
)
LANGUAGE sql STABLE AS $$
  SELECT
    ls.teacher_id,
    coalesce(p.full_name, 'غير معروف') AS teacher_name,
    count(*) FILTER (WHERE ls.status = 'submitted') AS submitted_count,
    count(*) AS total_count,
    CASE WHEN count(*) > 0
      THEN round(count(*) FILTER (WHERE ls.status = 'submitted')::numeric / count(*) * 100, 1)
      ELSE 0 END AS submission_rate
  FROM public.lesson_submissions ls
  LEFT JOIN public.profiles p ON p.id = ls.teacher_id
  WHERE ls.teacher_id IS NOT NULL
    AND (p_date_from IS NULL OR ls.date >= p_date_from)
    AND (p_date_to IS NULL OR ls.date <= p_date_to)
    AND (p_grade IS NULL OR ls.grade = p_grade)
    AND (p_section IS NULL OR ls.section = p_section)
    AND (p_subject_id IS NULL OR ls.subject_id = p_subject_id)
  GROUP BY ls.teacher_id, p.full_name
  ORDER BY submitted_count DESC, submission_rate DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.reports_top_teacher_submissions(date, date, text, text, uuid, int) TO authenticated;

-- =========================================================================
-- 6) reports_top_absent_lessons: lessons ranked by absence count.
-- =========================================================================
DROP FUNCTION IF EXISTS public.reports_top_absent_lessons(date, date, text, text, uuid, uuid, int);
CREATE OR REPLACE FUNCTION public.reports_top_absent_lessons(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_grade text DEFAULT NULL,
  p_section text DEFAULT NULL,
  p_subject_id uuid DEFAULT NULL,
  p_teacher_id uuid DEFAULT NULL,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  lesson text,
  subject_name text,
  absent_count bigint,
  total_count bigint,
  absence_rate numeric
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  PERFORM public.reports_assert_attendance_dates_valid();

  RETURN QUERY
  SELECT
    ar.lesson,
    max(s.name) AS subject_name,
    count(*) FILTER (WHERE ar.status = 'absent') AS absent_count,
    count(*) AS total_count,
    CASE WHEN count(*) > 0
      THEN round(count(*) FILTER (WHERE ar.status = 'absent')::numeric / count(*) * 100, 1)
      ELSE 0 END AS absence_rate
  FROM public.attendance_records ar
  LEFT JOIN public.subjects s ON s.id = ar.subject_id
  WHERE ar.lesson IS NOT NULL
    AND (p_date_from IS NULL OR NULLIF(ar.date, '')::date >= p_date_from)
    AND (p_date_to IS NULL OR NULLIF(ar.date, '')::date <= p_date_to)
    AND (p_grade IS NULL OR ar.grade = p_grade)
    AND (p_section IS NULL OR ar.section = p_section)
    AND (p_subject_id IS NULL OR ar.subject_id = p_subject_id)
    AND (p_teacher_id IS NULL OR ar.teacher_id = p_teacher_id)
  GROUP BY ar.lesson
  ORDER BY absent_count DESC, ar.lesson
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reports_top_absent_lessons(date, date, text, text, uuid, uuid, int) TO authenticated;

-- =========================================================================
-- 7) reports_students_table: per-student breakdown, sortable by absence
--    (worst first) or commitment (best first), paginated via LIMIT/OFFSET.
--    total_rows (a window count) lets the client render pagination controls
--    without a second round trip.
-- =========================================================================
DROP FUNCTION IF EXISTS public.reports_students_table(date, date, text, text, uuid, uuid, text, text, int, int);
CREATE OR REPLACE FUNCTION public.reports_students_table(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_grade text DEFAULT NULL,
  p_section text DEFAULT NULL,
  p_subject_id uuid DEFAULT NULL,
  p_teacher_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_sort text DEFAULT 'absent_desc',
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  student_id text,
  student_name text,
  grade text,
  section text,
  absent_count bigint,
  late_count bigint,
  excused_count bigint,
  present_count bigint,
  total_count bigint,
  commitment_rate numeric,
  total_rows bigint
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  PERFORM public.reports_assert_attendance_dates_valid();

  RETURN QUERY
  WITH agg AS (
    SELECT
      ar.student_id AS s_id,
      max(ar.student_name) AS s_name,
      max(ar.grade) AS s_grade,
      max(ar.section) AS s_section,
      count(*) FILTER (WHERE ar.status = 'absent') AS absent_c,
      count(*) FILTER (WHERE ar.status = 'late') AS late_c,
      count(*) FILTER (WHERE ar.status = 'excused') AS excused_c,
      count(*) FILTER (WHERE ar.status = 'present') AS present_c,
      count(*) AS total_c
    FROM public.attendance_records ar
    WHERE ar.student_id IS NOT NULL
      AND (p_date_from IS NULL OR NULLIF(ar.date, '')::date >= p_date_from)
      AND (p_date_to IS NULL OR NULLIF(ar.date, '')::date <= p_date_to)
      AND (p_grade IS NULL OR ar.grade = p_grade)
      AND (p_section IS NULL OR ar.section = p_section)
      AND (p_subject_id IS NULL OR ar.subject_id = p_subject_id)
      AND (p_teacher_id IS NULL OR ar.teacher_id = p_teacher_id)
      AND (p_status IS NULL OR ar.status = p_status)
    GROUP BY ar.student_id
  ),
  ranked AS (
    SELECT
      s_id, s_name, s_grade, s_section, absent_c, late_c, excused_c, present_c, total_c,
      CASE WHEN total_c > 0 THEN round(present_c::numeric / total_c * 100, 1) ELSE 0 END AS rate,
      count(*) OVER () AS row_count
    FROM agg
  )
  SELECT s_id, s_name, s_grade, s_section, absent_c, late_c, excused_c, present_c, total_c, rate, row_count
  FROM ranked
  ORDER BY
    CASE WHEN p_sort = 'commitment_desc' THEN rate END DESC NULLS LAST,
    CASE WHEN p_sort = 'commitment_desc' THEN total_c END DESC NULLS LAST,
    CASE WHEN p_sort <> 'commitment_desc' THEN absent_c END DESC NULLS LAST,
    total_c DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reports_students_table(date, date, text, text, uuid, uuid, text, text, int, int) TO authenticated;

-- =========================================================================
-- 8) reports_filter_options: small reference-list bundle (grades, sections,
--    subjects, teachers) for the filter dropdowns, in one round trip. Does
--    not touch any date column -- unaffected by the drift above.
-- =========================================================================
DROP FUNCTION IF EXISTS public.reports_filter_options();
CREATE OR REPLACE FUNCTION public.reports_filter_options()
RETURNS TABLE (
  grades text[],
  sections text[],
  subjects jsonb,
  teachers jsonb
)
LANGUAGE sql STABLE AS $$
  SELECT
    (SELECT array_agg(DISTINCT grade ORDER BY grade) FROM public.students WHERE grade IS NOT NULL) AS grades,
    (SELECT array_agg(name ORDER BY sort_order) FROM public.sections) AS sections,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY name), '[]'::jsonb) FROM public.subjects) AS subjects,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', full_name) ORDER BY full_name), '[]'::jsonb) FROM public.profiles WHERE role = 'teacher') AS teachers;
$$;

GRANT EXECUTE ON FUNCTION public.reports_filter_options() TO authenticated;
