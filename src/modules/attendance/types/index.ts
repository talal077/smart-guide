export type AttendanceStatus = "present" | "absent" | "late" | "excused";
export type AttendancePreparationStatus = "draft" | "submitted" | "verified";

export interface AttendanceStudent {
  id: string;
  name: string;
  grade: string;
  section: string;
  entryCode?: string | null;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  grade: string;
  section: string;
  lessonId: string;
  lessonName: string;
  date: string;
  status: AttendanceStatus;
  notes?: string | null;
  attendanceTime?: string | null;
  updatedAt: string;
}

export interface AttendancePreparation {
  id: string;
  lessonId: string;
  lessonName: string;
  date: string;
  teacherId?: string | null;
  teacherName?: string | null;
  grade?: string | null;
  section?: string | null;
  records: AttendanceRecord[];
  status: AttendancePreparationStatus;
  savedAt?: string | null;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  notes?: string | null;
}

export interface AttendancePreparationInput {
  lessonId: string;
  lessonName: string;
  date: string;
  teacherId?: string | null;
  teacherName?: string | null;
  subjectId?: string | null;
  grade?: string | null;
  section?: string | null;
  records: AttendanceRecord[];
  notes?: string | null;
}

export interface AttendanceFilters {
  date?: string;
  lessonId?: string;
  lessonName?: string;
  grade?: string;
  section?: string;
}

export interface AttendanceUploadCheck {
  lessonId: string;
  date: string;
  uploaded: boolean;
  preparedAt?: string | null;
  submittedAt?: string | null;
  verifiedAt?: string | null;
}

export interface TeacherProfile {
  id: string;
  name: string;
  email?: string | null;
  role?: string;
}

export interface TeacherSubject {
  id: string;
  name: string;
  code?: string | null;
}

export interface TeacherClassAssignment {
  id: string;
  grade: string;
  section: string;
  subjectId?: string | null;
}
