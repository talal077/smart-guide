import type {
  AttendanceFilters,
  AttendancePreparation,
  AttendancePreparationInput,
  AttendanceRecord,
  AttendanceStatus,
  AttendanceStudent,
  AttendanceUploadCheck,
  TeacherClassAssignment,
  TeacherProfile,
  TeacherSubject,
} from "../types";
import {
  AttendanceAuthError,
  getAssignedClasses,
  getAssignedSubjects,
  getAttendancePreparation as repoGetAttendancePreparation,
  getCurrentTeacher,
  getPreviousLessonRecords,
  getStudentsForAttendance as repoGetStudentsForAttendance,
  saveAttendancePreparation as repoSaveAttendancePreparation,
  submitAttendancePreparation as repoSubmitAttendancePreparation,
  verifyAttendanceUpload as repoVerifyAttendanceUpload,
} from "../repository/attendance.repository";
import { createAttendanceRecordId, normalizeAttendanceRecords } from "../utils/attendance.utils";

export { AttendanceAuthError };

export async function loadCurrentTeacher(): Promise<TeacherProfile> {
  return getCurrentTeacher();
}

export async function loadAssignedSubjects(teacherId: string): Promise<TeacherSubject[]> {
  return getAssignedSubjects(teacherId);
}

export async function loadAssignedClasses(teacherId: string, subjectId?: string): Promise<TeacherClassAssignment[]> {
  return getAssignedClasses(teacherId, subjectId);
}

export async function loadStudentsForAttendance(filters?: AttendanceFilters): Promise<AttendanceStudent[]> {
  return repoGetStudentsForAttendance(filters);
}

function buildRecord(student: AttendanceStudent, previous?: AttendanceRecord, context?: Partial<AttendanceRecord>): AttendanceRecord {
  return {
    id: previous?.id ?? createAttendanceRecordId(),
    studentId: student.id,
    studentName: student.name,
    grade: student.grade,
    section: student.section,
    lessonId: context?.lessonId ?? previous?.lessonId ?? "",
    lessonName: context?.lessonName ?? previous?.lessonName ?? "",
    date: context?.date ?? previous?.date ?? "",
    status: context?.status ?? previous?.status ?? "present",
    notes: context?.notes ?? previous?.notes ?? null,
    attendanceTime: context?.attendanceTime ?? previous?.attendanceTime ?? null,
    updatedAt: context?.updatedAt ?? previous?.updatedAt ?? new Date().toISOString(),
  };
}

export function markAllStudentsPresent(students: AttendanceStudent[], base: AttendanceRecord[] = [], context?: Partial<AttendanceRecord>): AttendanceRecord[] {
  const existing = new Map(base.map((record) => [record.studentId, record]));

  return students.map((student) => {
    const previous = existing.get(student.id);
    return buildRecord(student, previous, { ...context, status: "present" });
  });
}

// Every student in the class must get an attendance_records row on save, not only the
// ones the teacher explicitly touched -- otherwise a teacher who only marks the
// exceptions (e.g. 3 absences out of 5 students) would silently save just those 3 rows,
// leaving the other 2 students with no record at all. This builds one record per real
// roster student, preserving any status/notes already set in `records` and defaulting
// only the untouched ones to "present" (unlike markAllStudentsPresent above, which
// unconditionally resets everyone to "present" -- that stays reserved for the explicit
// "اعتبار الجميع حاضرين" button).
export function buildFullRosterRecords(students: AttendanceStudent[], records: AttendanceRecord[], context?: Partial<AttendanceRecord>): AttendanceRecord[] {
  const existing = new Map(records.map((record) => [record.studentId, record]));

  return students.map((student) => buildRecord(student, existing.get(student.id), context));
}

export function upsertStudentRecord(records: AttendanceRecord[], student: AttendanceStudent, context: Partial<AttendanceRecord>): AttendanceRecord[] {
  const nextRecord = buildRecord(student, records.find((record) => record.studentId === student.id), context);
  const existingIndex = records.findIndex((record) => record.studentId === student.id);

  if (existingIndex >= 0) {
    const nextRecords = [...records];
    nextRecords[existingIndex] = nextRecord;
    return nextRecords;
  }

  return [...records, nextRecord];
}

export function updateStudentStatus(records: AttendanceRecord[], student: AttendanceStudent, status: AttendanceStatus, context: Partial<AttendanceRecord>): AttendanceRecord[] {
  return upsertStudentRecord(records, student, { ...context, status, updatedAt: new Date().toISOString() });
}

export function updateStudentNotes(records: AttendanceRecord[], student: AttendanceStudent, notes: string, context: Partial<AttendanceRecord>): AttendanceRecord[] {
  return upsertStudentRecord(records, student, { ...context, notes, updatedAt: new Date().toISOString() });
}

export async function saveAttendancePreparation(input: AttendancePreparationInput): Promise<AttendancePreparation> {
  const records = normalizeAttendanceRecords(input.records);
  return repoSaveAttendancePreparation({ ...input, records });
}

export async function submitAttendancePreparation(input: AttendancePreparationInput): Promise<AttendancePreparation> {
  const records = normalizeAttendanceRecords(input.records);
  return repoSubmitAttendancePreparation({ ...input, records });
}

export async function verifyLessonUpload(filters: AttendanceFilters): Promise<AttendanceUploadCheck> {
  return repoVerifyAttendanceUpload(filters);
}

export async function loadAttendancePreparation(filters: AttendanceFilters): Promise<AttendancePreparation | null> {
  return repoGetAttendancePreparation(filters);
}

export async function copyFromPreviousLesson(
  students: AttendanceStudent[],
  currentRecords: AttendanceRecord[],
  grade: string,
  section: string,
  excludeDate: string,
  excludeLessonName: string,
  context: Partial<AttendanceRecord>
): Promise<AttendanceRecord[]> {
  const previousRecords = await getPreviousLessonRecords(grade, section, excludeDate, excludeLessonName);
  if (!previousRecords.length) return currentRecords;

  const byStudent = new Map(previousRecords.map((record) => [record.studentId, record]));

  return students.map((student) => {
    const previous = byStudent.get(student.id);
    const existing = currentRecords.find((record) => record.studentId === student.id);
    return buildRecord(student, existing, {
      ...context,
      status: previous?.status ?? existing?.status ?? "present",
      notes: previous?.notes ?? existing?.notes ?? null,
    });
  });
}
