import { createClient } from "@/lib/supabase";
import type {
  AttendanceFilters,
  AttendancePreparation,
  AttendancePreparationInput,
  AttendancePreparationStatus,
  AttendanceRecord,
  AttendanceStudent,
  AttendanceUploadCheck,
  TeacherClassAssignment,
  TeacherProfile,
  TeacherSubject,
} from "../types";

const supabase = createClient();

function toStudent(row: Record<string, unknown>): AttendanceStudent {
  return {
    id: String(row.id ?? ""),
    name: String(row.full_name ?? row.name ?? ""),
    grade: String(row.grade ?? ""),
    section: String(row.section ?? ""),
    entryCode: typeof row.entry_code === "string" ? row.entry_code : null,
  };
}

function toRecord(row: Record<string, unknown>): AttendanceRecord {
  return {
    id: String(row.id ?? ""),
    studentId: String(row.student_id ?? ""),
    studentName: String(row.student_name ?? ""),
    grade: String(row.grade ?? ""),
    section: String(row.section ?? ""),
    lessonId: "",
    lessonName: String(row.lesson ?? ""),
    date: String(row.date ?? ""),
    status: (row.status as AttendanceRecord["status"]) ?? "present",
    notes: typeof row.notes === "string" ? row.notes : null,
    attendanceTime: typeof row.attendance_time === "string" ? row.attendance_time : null,
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "حدث خطأ غير متوقع في الاتصال بقاعدة البيانات.";
}

export class AttendanceAuthError extends Error {}

export async function getCurrentTeacher(): Promise<TeacherProfile> {
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    throw new AttendanceAuthError("يجب تسجيل الدخول لعرض صفحة تحضير الحصص.");
  }

  const userId = authData.user.id;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, is_blocked")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(getErrorMessage(error));

  if (!data) {
    throw new AttendanceAuthError("لم يتم العثور على ملف المستخدم الحالي.");
  }

  if (data.is_blocked || data.is_active === false) {
    throw new AttendanceAuthError("هذا الحساب غير نشط أو محظور.");
  }

  return {
    id: String(data.id),
    name: String(data.full_name ?? authData.user.email ?? "المستخدم الحالي"),
    email: authData.user.email ?? null,
    role: String(data.role ?? ""),
  };
}

export async function getAssignedSubjects(teacherId: string): Promise<TeacherSubject[]> {
  // Deterministic order matters here: whichever row comes back first becomes the
  // default subject selected when the attendance page (re)mounts (e.g. right after a
  // fresh login). Without an explicit ORDER BY, Postgres makes no ordering guarantee at
  // all for a plain SELECT, so a teacher with more than one assignment could land on a
  // different "default" subject/class on every reload -- which looks exactly like
  // "my saved attendance disappeared" even though the underlying rows are untouched.
  const { data, error } = await supabase
    .from("teacher_assignments")
    .select("subject_id, subjects(id, name, code)")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(getErrorMessage(error));

  const seen = new Set<string>();
  const subjects: TeacherSubject[] = [];

  for (const row of data ?? []) {
    const subject = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
    const id = subject?.id ? String(subject.id) : row.subject_id ? String(row.subject_id) : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    subjects.push({
      id,
      name: String(subject?.name ?? ""),
      code: typeof subject?.code === "string" ? subject.code : null,
    });
  }

  return subjects;
}

export async function getAssignedClasses(teacherId: string, subjectId?: string): Promise<TeacherClassAssignment[]> {
  let query = supabase.from("teacher_assignments").select("id, grade, section, subject_id").eq("teacher_id", teacherId);

  if (subjectId) {
    query = query.eq("subject_id", subjectId);
  }

  // Same determinism requirement as getAssignedSubjects above: the first row here
  // becomes the default grade/section on mount.
  query = query.order("created_at", { ascending: true });

  const { data, error } = await query;
  if (error) throw new Error(getErrorMessage(error));

  return (data ?? []).map((item) => ({
    id: String(item.id ?? ""),
    grade: String(item.grade ?? ""),
    section: String(item.section ?? ""),
    subjectId: typeof item.subject_id === "string" ? item.subject_id : null,
  }));
}

export async function getStudentsForAttendance(filters?: AttendanceFilters): Promise<AttendanceStudent[]> {
  if (!filters?.grade || !filters?.section) return [];

  const { data, error } = await supabase
    .from("students")
    .select("id, full_name, grade, section, entry_code")
    .eq("grade", filters.grade)
    .eq("section", filters.section)
    .order("full_name", { ascending: true });

  if (error) throw new Error(getErrorMessage(error));

  // No mock/demo fallback: an empty result here is real information (no students are
  // enrolled in this grade/section) and must surface as a clear empty state in the UI,
  // never as fabricated placeholder students that quietly can't be saved.
  return (data ?? []).map(toStudent);
}

export async function getAttendancePreparation(filters: AttendanceFilters): Promise<AttendancePreparation | null> {
  const { date, lessonName, grade, section } = filters;
  if (!date || !lessonName || !grade || !section) return null;

  const [submissionResult, recordsResult] = await Promise.all([
    supabase.from("lesson_submissions").select("*").eq("date", date).eq("lesson", lessonName).eq("grade", grade).eq("section", section).maybeSingle(),
    supabase.from("attendance_records").select("*").eq("date", date).eq("lesson", lessonName).eq("grade", grade).eq("section", section),
  ]);

  if (submissionResult.error) throw new Error(getErrorMessage(submissionResult.error));
  if (recordsResult.error) throw new Error(getErrorMessage(recordsResult.error));

  const submission = submissionResult.data;
  const records = (recordsResult.data ?? []).map(toRecord);

  if (!submission && records.length === 0) return null;

  return {
    id: submission?.id ? String(submission.id) : `${grade}-${section}-${date}-${lessonName}`,
    lessonId: filters.lessonId ?? "",
    lessonName,
    date,
    teacherId: submission?.teacher_id ? String(submission.teacher_id) : null,
    teacherName: null,
    grade,
    section,
    records,
    status: (submission?.status as AttendancePreparationStatus) ?? "draft",
    savedAt: submission?.saved_at ?? null,
    submittedAt: submission?.submitted_at ?? null,
    notes: submission?.notes ?? null,
  };
}

async function upsertRecords(input: AttendancePreparationInput) {
  if (!input.records.length) return;

  const rows = input.records.map((record) => ({
    // attendance_records.id has no DB-side default, so a value must always be sent
    // (verified against the live schema: omitting it fails with
    // `null value in column "id" violates not-null constraint`).
    id: record.id,
    student_id: record.studentId,
    student_name: record.studentName,
    grade: input.grade,
    section: input.section,
    date: input.date,
    lesson: input.lessonName,
    status: record.status,
    notes: record.notes ?? null,
    teacher_id: input.teacherId ?? null,
    teacher_name: input.teacherName ?? null,
    subject_id: input.subjectId ?? null,
    attendance_time: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  // Conflict target is the natural key (one row per student per lesson/date), not the
  // client-generated `id`, so re-saving the same lesson always updates in place instead
  // of depending on the browser having previously received back the real DB row id.
  // (Confirmed live: this unique constraint already exists on attendance_records.)
  const { error } = await supabase
    .from("attendance_records")
    .upsert(rows, { onConflict: "student_id,grade,section,date,lesson" });
  if (error) throw new Error(getErrorMessage(error));
}

export async function saveAttendancePreparation(input: AttendancePreparationInput): Promise<AttendancePreparation> {
  const { error } = await supabase
    .from("lesson_submissions")
    .upsert(
      {
        teacher_id: input.teacherId ?? null,
        subject_id: input.subjectId ?? null,
        grade: input.grade,
        section: input.section,
        date: input.date,
        lesson: input.lessonName,
        status: "draft",
        notes: input.notes ?? null,
        saved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "grade,section,date,lesson" }
    );

  if (error) throw new Error(getErrorMessage(error));

  await upsertRecords(input);

  const preparation = await getAttendancePreparation({
    date: input.date,
    lessonId: input.lessonId,
    lessonName: input.lessonName,
    grade: input.grade ?? undefined,
    section: input.section ?? undefined,
  });

  if (!preparation) throw new Error("تعذر حفظ التحضير.");
  return preparation;
}

export async function submitAttendancePreparation(input: AttendancePreparationInput): Promise<AttendancePreparation> {
  const existing = await getAttendancePreparation({
    date: input.date,
    lessonId: input.lessonId,
    lessonName: input.lessonName,
    grade: input.grade ?? undefined,
    section: input.section ?? undefined,
  });

  if (existing?.status === "submitted") {
    throw new Error("لا يمكن إرسال نفس الحصة مرتين.");
  }

  const { error } = await supabase
    .from("lesson_submissions")
    .upsert(
      {
        teacher_id: input.teacherId ?? null,
        subject_id: input.subjectId ?? null,
        grade: input.grade,
        section: input.section,
        date: input.date,
        lesson: input.lessonName,
        status: "submitted",
        notes: input.notes ?? null,
        saved_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "grade,section,date,lesson" }
    );

  if (error) throw new Error(getErrorMessage(error));

  await upsertRecords(input);

  const preparation = await getAttendancePreparation({
    date: input.date,
    lessonId: input.lessonId,
    lessonName: input.lessonName,
    grade: input.grade ?? undefined,
    section: input.section ?? undefined,
  });

  if (!preparation) throw new Error("تعذر إرسال التحضير.");
  return preparation;
}

export async function verifyAttendanceUpload(filters: AttendanceFilters): Promise<AttendanceUploadCheck> {
  const preparation = await getAttendancePreparation(filters);

  return {
    lessonId: filters.lessonId ?? "",
    date: filters.date ?? "",
    uploaded: Boolean(preparation?.id),
    preparedAt: preparation?.savedAt ?? null,
    submittedAt: preparation?.submittedAt ?? null,
    verifiedAt: preparation?.verifiedAt ?? null,
  };
}

export async function getPreviousLessonRecords(grade: string, section: string, excludeDate: string, excludeLessonName: string): Promise<AttendanceRecord[]> {
  if (!grade || !section) return [];

  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("grade", grade)
    .eq("section", section)
    .order("date", { ascending: false })
    .order("attendance_time", { ascending: false })
    .limit(200);

  if (error) throw new Error(getErrorMessage(error));

  const rows = (data ?? []).filter((row) => !(String(row.date) === excludeDate && String(row.lesson) === excludeLessonName));
  if (!rows.length) return [];

  const latestKey = `${rows[0].date}__${rows[0].lesson}`;
  const latestRows = rows.filter((row) => `${row.date}__${row.lesson}` === latestKey);

  return latestRows.map(toRecord);
}
