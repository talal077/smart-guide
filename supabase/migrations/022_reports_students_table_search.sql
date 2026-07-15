-- Adds student-name search to reports_students_table (migration 015). The
-- reports page previously had pagination and fixed sort but no way to find a
-- specific student by name within "أكثر الطلاب غياباً"/"أكثر الطلاب التزاماً"
-- without paging through everything -- a real gap flagged during the
-- production review of /reports.
--
-- Adding a trailing parameter to an existing function via plain
-- CREATE OR REPLACE would NOT replace the old 10-parameter function in
-- place -- Postgres treats a changed parameter list as a distinct overload,
-- so the old signature would keep resolving for any exact-arity caller and
-- silently ignore search. The DROP FUNCTION below (exact old signature) is
-- required, matching the "safe to rerun wholesale" convention migration 015
-- already established.
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
  p_offset int DEFAULT 0,
  p_search text DEFAULT NULL
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
  filtered AS (
    SELECT *
    FROM agg
    WHERE p_search IS NULL OR btrim(p_search) = '' OR s_name ILIKE '%' || btrim(p_search) || '%'
  ),
  ranked AS (
    SELECT
      s_id, s_name, s_grade, s_section, absent_c, late_c, excused_c, present_c, total_c,
      CASE WHEN total_c > 0 THEN round(present_c::numeric / total_c * 100, 1) ELSE 0 END AS rate,
      count(*) OVER () AS row_count
    FROM filtered
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

GRANT EXECUTE ON FUNCTION public.reports_students_table(date, date, text, text, uuid, uuid, text, text, int, int, text) TO authenticated;
