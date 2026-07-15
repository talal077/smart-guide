import { supabase } from "@/lib/supabase";

export type TeacherOption = { id: string; name: string };

export type TeacherLookupResult = {
  autoTeacher: TeacherOption | null;
  candidates: TeacherOption[];
  source: "schedule" | "assignments" | "none";
};

const WEEKDAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function arabicWeekdayFromDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return WEEKDAY_AR[date.getDay()] ?? WEEKDAY_AR[0];
}

function dedupeTeachers(rows: { id: string; full_name: string }[]): TeacherOption[] {
  const map = new Map<string, TeacherOption>();
  for (const row of rows) {
    if (row?.id && !map.has(row.id)) map.set(row.id, { id: row.id, name: row.full_name ?? "" });
  }
  return Array.from(map.values());
}

/**
 * Resolves which teacher should receive a student-action request for a given
 * grade/section/date/lesson. Tries, in order: (1) the exact class_schedule slot,
 * (2) any teacher assigned to that grade+section via teacher_assignments,
 * (3) the full active-teacher list as a manual-pick fallback.
 */
export async function findTeacherForClass(params: {
  grade: string;
  section: string;
  date: string;
  lessonNumber: number;
}): Promise<TeacherLookupResult> {
  const dayOfWeek = arabicWeekdayFromDate(params.date);

  const { data: scheduleRows } = await supabase
    .from("class_schedule")
    .select("teacher_id, profiles(id, full_name, is_active, is_blocked)")
    .eq("day_of_week", dayOfWeek)
    .eq("period", params.lessonNumber)
    .eq("grade", params.grade)
    .eq("section", params.section)
    .limit(1);

  const scheduleTeacher = (scheduleRows?.[0] as any)?.profiles;
  if (scheduleTeacher?.id && scheduleTeacher.is_active && !scheduleTeacher.is_blocked) {
    return {
      autoTeacher: { id: scheduleTeacher.id, name: scheduleTeacher.full_name ?? "" },
      candidates: [],
      source: "schedule",
    };
  }

  const { data: assignmentRows } = await supabase
    .from("teacher_assignments")
    .select("profiles(id, full_name, is_active, is_blocked)")
    .eq("grade", params.grade)
    .eq("section", params.section);

  const assignmentTeachers = dedupeTeachers(
    ((assignmentRows ?? []) as any[])
      .map((row) => row.profiles)
      .filter((profile) => profile?.id && profile.is_active && !profile.is_blocked)
  );

  if (assignmentTeachers.length === 1) {
    return { autoTeacher: assignmentTeachers[0], candidates: [], source: "assignments" };
  }

  if (assignmentTeachers.length > 1) {
    return { autoTeacher: null, candidates: assignmentTeachers, source: "assignments" };
  }

  // No class_schedule slot and no teacher_assignments match for this exact
  // grade+section: do not fall back to the full teacher roster, since that
  // would let the requester assign someone with no real link to this class.
  return { autoTeacher: null, candidates: [], source: "none" };
}

/** Full active-teacher roster, used only for the history log's teacher filter
 * dropdown (not for auto-assignment — see findTeacherForClass above). */
export async function listActiveTeachers(): Promise<TeacherOption[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "teacher")
    .eq("is_active", true)
    .eq("is_blocked", false)
    .order("full_name", { ascending: true });
  return dedupeTeachers((data ?? []) as any[]);
}
