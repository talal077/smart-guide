-- Restricts the reports RPC functions (migration 015) so that a caller whose
-- profiles.role = 'teacher' only ever sees data for lessons/classes they
-- personally teach, instead of the full-school data every other role sees.
--
-- Context: /reports is reachable by principal/admin/vice_principal, teacher,
-- and student (src/lib/permissions.ts). Every RPC in migration 015 is
-- SECURITY INVOKER against RLS policies that only check "auth.uid() IS NOT
-- NULL" (see migration 013), so there was previously no row-level distinction
-- between a principal and a teacher calling the same function -- a teacher
-- account could see every other student's name/absence count and a
-- name-ranked leaderboard of every other teacher's attendance-submission
-- compliance. Per-student scoping is a separate, larger problem (there is no
-- column anywhere linking a profiles.role = 'student' row to a specific row
-- in public.students -- see src/app/student/page.tsx, which is static
-- placeholder content with no query at all) and is intentionally NOT
-- addressed here; student accounts keep the current full-school view.
--
-- Teacher scoping IS implementable cleanly because attendance_records.teacher_id
-- and lesson_submissions.teacher_id both already store the teacher's own
-- profiles.id (== auth.uid()) -- see migration 003. The pattern used below in
-- every function:
--   effective_teacher_id := CASE WHEN caller_role = 'teacher' THEN auth.uid()
--                                 ELSE p_teacher_id END;
-- forces a teacher caller's own id regardless of whatever p_teacher_id the
-- client passed (so a teacher cannot pass someone else's teacher_id to read
-- their data), while leaving every other role's behavior byte-for-byte
-- identical to migration 015 (effective_teacher_id degrades to the original
-- p_teacher_id passthrough).
--
-- reports_summary's total_students figure counts public.students directly,
-- which has no teacher_id column at all, so it is scoped instead via
-- public.teacher_assignments (teacher_id, grade, section) -- a teacher's
-- "total students" now means students in a grade/section they are assigned
-- to teach.
--
-- All signatures (parameter lists and RETURNS TABLE shapes) are unchanged
-- from migration 015, so CREATE OR REPLACE is used directly with no
-- preceding DROP FUNCTION.

-- =========================================================================
-- 1) reports_summary
-- =========================================================================
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
DECLARE
  caller_role text;
  effective_teacher_id uuid;
BEGIN
  PERFORM public.reports_assert_attendance_dates_valid();

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  effective_teacher_id := CASE WHEN caller_role = 'teacher' THEN auth.uid() ELSE p_teacher_id END;

  RETURN QUERY
  WITH student_totals AS (
    SELECT count(*) AS c
    FROM public.students s
    WHERE (p_grade IS NULL OR s.grade = p_grade)
      AND (p_section IS NULL OR s.section = p_section)
      AND (
        caller_role <> 'teacher'
        OR EXISTS (
          SELECT 1 FROM public.teacher_assignments ta
          WHERE ta.teacher_id = auth.uid() AND ta.grade = s.grade AND ta.section = s.section
        )
      )
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
      AND (effective_teacher_id IS NULL OR ar.teacher_id = effective_teacher_id)
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

-- =========================================================================
-- 2) reports_daily_attendance
-- =========================================================================
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
DECLARE
  caller_role text;
  effective_teacher_id uuid;
BEGIN
  PERFORM public.reports_assert_attendance_dates_valid();

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  effective_teacher_id := CASE WHEN caller_role = 'teacher' THEN auth.uid() ELSE p_teacher_id END;

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
    AND (effective_teacher_id IS NULL OR ar.teacher_id = effective_teacher_id)
    AND (p_status IS NULL OR ar.status = p_status)
  GROUP BY NULLIF(ar.date, '')::date
  ORDER BY NULLIF(ar.date, '')::date;
END;
$$;

-- =========================================================================
-- 3) reports_top_absent_grades
-- =========================================================================
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
DECLARE
  caller_role text;
  effective_teacher_id uuid;
BEGIN
  PERFORM public.reports_assert_attendance_dates_valid();

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  effective_teacher_id := CASE WHEN caller_role = 'teacher' THEN auth.uid() ELSE p_teacher_id END;

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
    AND (effective_teacher_id IS NULL OR ar.teacher_id = effective_teacher_id)
    AND (p_status IS NULL OR ar.status = p_status)
  GROUP BY ar.grade
  ORDER BY absent_count DESC, ar.grade
  LIMIT p_limit;
END;
$$;

-- =========================================================================
-- 4) reports_top_committed_sections
-- =========================================================================
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
DECLARE
  caller_role text;
  effective_teacher_id uuid;
BEGIN
  PERFORM public.reports_assert_attendance_dates_valid();

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  effective_teacher_id := CASE WHEN caller_role = 'teacher' THEN auth.uid() ELSE p_teacher_id END;

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
    AND (effective_teacher_id IS NULL OR ar.teacher_id = effective_teacher_id)
    AND (p_status IS NULL OR ar.status = p_status)
  GROUP BY ar.grade, ar.section
  HAVING count(*) > 0
  ORDER BY commitment_rate DESC, total_count DESC
  LIMIT p_limit;
END;
$$;

-- =========================================================================
-- 5) reports_top_teacher_submissions
--    Stays LANGUAGE sql (no local variables needed): the teacher-role check
--    is inlined as a scalar subquery in the WHERE clause. A teacher caller
--    now only ever gets their own single row back, never a leaderboard of
--    every other teacher's name and compliance rate.
-- =========================================================================
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
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) IS DISTINCT FROM 'teacher'
      OR ls.teacher_id = auth.uid()
    )
  GROUP BY ls.teacher_id, p.full_name
  ORDER BY submitted_count DESC, submission_rate DESC
  LIMIT p_limit;
$$;

-- =========================================================================
-- 6) reports_top_absent_lessons
-- =========================================================================
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
DECLARE
  caller_role text;
  effective_teacher_id uuid;
BEGIN
  PERFORM public.reports_assert_attendance_dates_valid();

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  effective_teacher_id := CASE WHEN caller_role = 'teacher' THEN auth.uid() ELSE p_teacher_id END;

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
    AND (effective_teacher_id IS NULL OR ar.teacher_id = effective_teacher_id)
  GROUP BY ar.lesson
  ORDER BY absent_count DESC, ar.lesson
  LIMIT p_limit;
END;
$$;

-- =========================================================================
-- 7) reports_students_table
-- =========================================================================
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
DECLARE
  caller_role text;
  effective_teacher_id uuid;
BEGIN
  PERFORM public.reports_assert_attendance_dates_valid();

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  effective_teacher_id := CASE WHEN caller_role = 'teacher' THEN auth.uid() ELSE p_teacher_id END;

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
      AND (effective_teacher_id IS NULL OR ar.teacher_id = effective_teacher_id)
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
