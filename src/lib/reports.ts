import { supabase } from "@/lib/supabase";

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export type ReportFilters = {
  dateFrom: string | null;
  dateTo: string | null;
  grade: string | null;
  section: string | null;
  subjectId: string | null;
  teacherId: string | null;
  status: AttendanceStatus | null;
};

export const EMPTY_FILTERS: ReportFilters = {
  dateFrom: null,
  dateTo: null,
  grade: null,
  section: null,
  subjectId: null,
  teacherId: null,
  status: null,
};

function baseParams(filters: ReportFilters) {
  return {
    p_date_from: filters.dateFrom,
    p_date_to: filters.dateTo,
    p_grade: filters.grade,
    p_section: filters.section,
    p_subject_id: filters.subjectId,
    p_teacher_id: filters.teacherId,
    p_status: filters.status,
  };
}

export type FilterOptions = {
  grades: string[];
  sections: string[];
  subjects: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
};

type FilterOptionsRow = {
  grades: string[] | null;
  sections: string[] | null;
  subjects: { id: string; name: string }[] | null;
  teachers: { id: string; name: string }[] | null;
};

export async function getReportFilterOptions(): Promise<FilterOptions> {
  const { data, error } = await supabase.rpc("reports_filter_options").maybeSingle();
  if (error) throw error;
  const row = data as FilterOptionsRow | null;

  return {
    grades: row?.grades ?? [],
    sections: row?.sections ?? [],
    subjects: row?.subjects ?? [],
    teachers: row?.teachers ?? [],
  };
}

export type ReportsSummary = {
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  totalRecords: number;
  attendanceRate: number;
  absenceRate: number;
};

const EMPTY_SUMMARY: ReportsSummary = {
  totalStudents: 0,
  presentCount: 0,
  absentCount: 0,
  lateCount: 0,
  excusedCount: 0,
  totalRecords: 0,
  attendanceRate: 0,
  absenceRate: 0,
};

type ReportsSummaryRow = {
  total_students: number | null;
  present_count: number | null;
  absent_count: number | null;
  late_count: number | null;
  excused_count: number | null;
  total_records: number | null;
  attendance_rate: number | null;
  absence_rate: number | null;
};

export async function getReportsSummary(filters: ReportFilters): Promise<ReportsSummary> {
  const { data, error } = await supabase.rpc("reports_summary", baseParams(filters)).maybeSingle();
  if (error) throw error;
  const row = data as ReportsSummaryRow | null;
  if (!row) return EMPTY_SUMMARY;

  return {
    totalStudents: Number(row.total_students ?? 0),
    presentCount: Number(row.present_count ?? 0),
    absentCount: Number(row.absent_count ?? 0),
    lateCount: Number(row.late_count ?? 0),
    excusedCount: Number(row.excused_count ?? 0),
    totalRecords: Number(row.total_records ?? 0),
    attendanceRate: Number(row.attendance_rate ?? 0),
    absenceRate: Number(row.absence_rate ?? 0),
  };
}

export type DailyAttendancePoint = {
  day: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
};

export async function getDailyAttendance(filters: ReportFilters): Promise<DailyAttendancePoint[]> {
  const { data, error } = await supabase.rpc("reports_daily_attendance", baseParams(filters));
  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    day: String(row.day),
    present: Number(row.present_count ?? 0),
    absent: Number(row.absent_count ?? 0),
    late: Number(row.late_count ?? 0),
    excused: Number(row.excused_count ?? 0),
    total: Number(row.total_count ?? 0),
  }));
}

export type TopAbsentGrade = { grade: string; absentCount: number; totalCount: number; absenceRate: number };

export async function getTopAbsentGrades(filters: ReportFilters, limit = 10): Promise<TopAbsentGrade[]> {
  const { data, error } = await supabase.rpc("reports_top_absent_grades", { ...baseParams(filters), p_limit: limit });
  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    grade: String(row.grade),
    absentCount: Number(row.absent_count ?? 0),
    totalCount: Number(row.total_count ?? 0),
    absenceRate: Number(row.absence_rate ?? 0),
  }));
}

export type TopCommittedSection = {
  grade: string;
  section: string;
  presentCount: number;
  totalCount: number;
  commitmentRate: number;
};

export async function getTopCommittedSections(filters: ReportFilters, limit = 10): Promise<TopCommittedSection[]> {
  const { data, error } = await supabase.rpc("reports_top_committed_sections", { ...baseParams(filters), p_limit: limit });
  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    grade: String(row.grade),
    section: String(row.section),
    presentCount: Number(row.present_count ?? 0),
    totalCount: Number(row.total_count ?? 0),
    commitmentRate: Number(row.commitment_rate ?? 0),
  }));
}

export type TopTeacherSubmission = {
  teacherId: string;
  teacherName: string;
  submittedCount: number;
  totalCount: number;
  submissionRate: number;
};

export async function getTopTeacherSubmissions(filters: ReportFilters, limit = 10): Promise<TopTeacherSubmission[]> {
  const { data, error } = await supabase.rpc("reports_top_teacher_submissions", {
    p_date_from: filters.dateFrom,
    p_date_to: filters.dateTo,
    p_grade: filters.grade,
    p_section: filters.section,
    p_subject_id: filters.subjectId,
    p_limit: limit,
  });
  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    teacherId: String(row.teacher_id),
    teacherName: String(row.teacher_name),
    submittedCount: Number(row.submitted_count ?? 0),
    totalCount: Number(row.total_count ?? 0),
    submissionRate: Number(row.submission_rate ?? 0),
  }));
}

export type TopAbsentLesson = {
  lesson: string;
  subjectName: string | null;
  absentCount: number;
  totalCount: number;
  absenceRate: number;
};

export async function getTopAbsentLessons(filters: ReportFilters, limit = 10): Promise<TopAbsentLesson[]> {
  const { data, error } = await supabase.rpc("reports_top_absent_lessons", {
    p_date_from: filters.dateFrom,
    p_date_to: filters.dateTo,
    p_grade: filters.grade,
    p_section: filters.section,
    p_subject_id: filters.subjectId,
    p_teacher_id: filters.teacherId,
    p_limit: limit,
  });
  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    lesson: String(row.lesson),
    subjectName: row.subject_name ? String(row.subject_name) : null,
    absentCount: Number(row.absent_count ?? 0),
    totalCount: Number(row.total_count ?? 0),
    absenceRate: Number(row.absence_rate ?? 0),
  }));
}

export type StudentReportRow = {
  studentId: string;
  studentName: string;
  grade: string;
  section: string;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  presentCount: number;
  totalCount: number;
  commitmentRate: number;
};

export type StudentsTablePage = {
  rows: StudentReportRow[];
  totalRows: number;
};

export type StudentSort = "absent_desc" | "commitment_desc";

export async function getStudentsTable(
  filters: ReportFilters,
  sort: StudentSort,
  limit: number,
  offset: number,
  search: string | null = null
): Promise<StudentsTablePage> {
  const { data, error } = await supabase.rpc("reports_students_table", {
    ...baseParams(filters),
    p_sort: sort,
    p_limit: limit,
    p_offset: offset,
    p_search: search,
  });
  if (error) throw error;

  const rows = (data ?? []).map((row: Record<string, unknown>) => ({
    studentId: String(row.student_id),
    studentName: String(row.student_name ?? ""),
    grade: String(row.grade ?? ""),
    section: String(row.section ?? ""),
    absentCount: Number(row.absent_count ?? 0),
    lateCount: Number(row.late_count ?? 0),
    excusedCount: Number(row.excused_count ?? 0),
    presentCount: Number(row.present_count ?? 0),
    totalCount: Number(row.total_count ?? 0),
    commitmentRate: Number(row.commitment_rate ?? 0),
  }));

  const totalRows = (data ?? [])[0]?.total_rows ? Number((data ?? [])[0].total_rows) : rows.length;

  return { rows, totalRows };
}
