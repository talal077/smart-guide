import type { AttendanceRecord } from "../types";

const SAUDI_TIME_ZONE = "Asia/Riyadh";

// Always resolves "today" against the Asia/Riyadh calendar date, regardless of the
// device's own system timezone (a teacher's phone/laptop clock/timezone could be
// misconfigured, and this is the one date every save/load lookup is keyed on).
// Deliberately not `new Date().toISOString().slice(0, 10)`, which reads the UTC date
// and would silently roll over a day early/late for any timezone west/east of UTC
// around midnight Saudi time.
export function getSaudiTodayIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAUDI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

// The "which lesson am I looking at" context a teacher last worked on: which subject,
// grade, section and period. Deliberately does NOT include the attendance date (a new
// day should default to "today", not silently reopen a stale old date) and NEVER
// includes attendance statuses/notes themselves -- those always come fresh from
// Supabase via getAttendancePreparation, never from this cache. This is purely a UX
// convenience so the page reopens the same class/period after a fresh login instead of
// falling back to an arbitrary assignment; it is not the source of truth for attendance
// data and retrieval must work correctly even if this is empty or stale.
export type AttendanceLastContext = {
  subjectId: string;
  grade: string;
  section: string;
  lessonId: string;
  lessonName: string;
};

function lastContextStorageKey(teacherId: string) {
  return `smart-guide:attendance:last-context:${teacherId}`;
}

export function readLastAttendanceContext(teacherId: string): AttendanceLastContext | null {
  if (typeof window === "undefined" || !teacherId) return null;

  try {
    const raw = window.localStorage.getItem(lastContextStorageKey(teacherId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<AttendanceLastContext>;
    if (!parsed.grade || !parsed.section) return null;

    return {
      subjectId: parsed.subjectId ?? "",
      grade: parsed.grade,
      section: parsed.section,
      lessonId: parsed.lessonId ?? "lesson-1",
      lessonName: parsed.lessonName ?? "الحصة الأولى",
    };
  } catch {
    return null;
  }
}

export function writeLastAttendanceContext(teacherId: string, context: AttendanceLastContext) {
  if (typeof window === "undefined" || !teacherId) return;
  if (!context.grade || !context.section) return;

  try {
    window.localStorage.setItem(lastContextStorageKey(teacherId), JSON.stringify(context));
  } catch {
    // Best-effort only (e.g. private-browsing storage quota) -- never blocks the actual
    // Supabase save/load flow, which remains correct without this convenience cache.
  }
}

// attendance_records.id is a Postgres `uuid` column, so this must produce a real UUID
// (the previous `attendance-<studentId>-<timestamp>` format made every insert fail with
// "invalid input syntax for type uuid").
export function createAttendanceRecordId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function normalizeAttendanceRecords(records: AttendanceRecord[]): AttendanceRecord[] {
  return records.map((record) => ({
    ...record,
    status: record.status ?? "present",
  }));
}

export function getAttendanceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    present: "حاضر",
    absent: "غائب",
    late: "متأخر",
    excused: "مستأذن",
  };

  return labels[status] ?? status;
}
