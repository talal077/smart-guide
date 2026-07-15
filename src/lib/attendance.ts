import { supabase } from "@/lib/supabase";

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export type AttendanceRecord = {
  id: string;
  studentId: string;
  studentName: string;
  grade: string;
  section: string;
  date: string;
  lesson: string;
  status: AttendanceStatus;
  updatedAt: string;
  teacherId?: string;
  teacherName?: string;
  attendanceTime?: string;
};

function toAttendanceRecord(row: any): AttendanceRecord {
  return {
    id: String(row.id),
    studentId: row.student_id ?? row.studentId ?? "",
    studentName: row.student_name ?? row.studentName ?? "",
    grade: row.grade ?? "",
    section: row.section ?? "",
    date: row.date ?? "",
    lesson: row.lesson ?? "",
    status: row.status ?? "present",
    updatedAt: row.updated_at ?? row.updatedAt ?? new Date().toISOString(),
    teacherId: row.teacher_id ?? row.teacherId ?? undefined,
    teacherName: row.teacher_name ?? row.teacherName ?? undefined,
    attendanceTime: row.attendance_time ?? row.attendanceTime ?? undefined,
  };
}

function toRow(record: AttendanceRecord) {
  const now = new Date().toISOString();
  return {
    id: record.id,
    student_id: record.studentId,
    student_name: record.studentName,
    grade: record.grade,
    section: record.section,
    date: record.date,
    lesson: record.lesson,
    status: record.status,
    teacher_id: record.teacherId ?? null,
    teacher_name: record.teacherName ?? null,
    attendance_time: record.attendanceTime ?? now,
    updated_at: record.updatedAt ?? now,
  };
}

export async function getAttendance(date?: string, lesson?: string): Promise<AttendanceRecord[]> {
  let query = supabase.from("attendance_records").select("*").order("updated_at", { ascending: false });
  if (date) query = query.eq("date", date);
  if (lesson) query = query.eq("lesson", lesson);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toAttendanceRecord);
}

/**
 * Fetch every row of attendance_records, bypassing PostgREST's default
 * 1000-row response cap via range-paginated requests. Used by pages (e.g.
 * /absence-records) that need accurate totals over the full table rather
 * than the most-recently-updated slice `getAttendance()` returns.
 */
export async function getAllAttendance(): Promise<AttendanceRecord[]> {
  const pageSize = 1000;
  const concurrency = 4;

  const { count, error: countError } = await supabase
    .from("attendance_records")
    .select("*", { count: "exact", head: true });
  if (countError) throw countError;

  const total = count ?? 0;
  if (total === 0) return [];

  const pageStarts: number[] = [];
  for (let from = 0; from < total; from += pageSize) pageStarts.push(from);

  async function fetchPage(from: number): Promise<AttendanceRecord[]> {
    const { data, error } = await supabase
      .from("attendance_records")
      .select("*")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    return (data ?? []).map(toAttendanceRecord);
  }

  const pages: AttendanceRecord[][] = new Array(pageStarts.length);
  for (let i = 0; i < pageStarts.length; i += concurrency) {
    const batch = pageStarts.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(fetchPage));
    results.forEach((rows, j) => {
      pages[i + j] = rows;
    });
  }

  return pages.flat();
}

export async function saveAttendance(records: AttendanceRecord[]) {
  const rows = records.map(toRow);
  if (!rows.length) return true;
  const { error } = await supabase.from("attendance_records").upsert(rows, { onConflict: "id" });
  if (error) throw error;
  return true;
}

export async function deleteAttendance(id: string) {
  const { error } = await supabase.from("attendance_records").delete().eq("id", id);
  if (error) throw error;
}

export type AttendanceSummary = {
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
};

/** Compact absence summary for a single student over the last `days` days. */
export async function getStudentAttendanceSummary(studentId: string, days = 30): Promise<AttendanceSummary> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("attendance_records")
    .select("status")
    .eq("student_id", studentId)
    .gte("date", sinceIso);
  if (error) throw error;

  const rows = data ?? [];
  return {
    present: rows.filter((r) => r.status === "present").length,
    absent: rows.filter((r) => r.status === "absent").length,
    late: rows.filter((r) => r.status === "late").length,
    excused: rows.filter((r) => r.status === "excused").length,
    total: rows.length,
  };
}
