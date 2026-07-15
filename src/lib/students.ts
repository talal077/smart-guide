import { supabase } from "@/lib/supabase";

export type StudentRecord = {
  id: string;
  name: string;
  grade: string;
  section: string;
  entryCode: string;
};

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function toStudentRecord(row: any): StudentRecord {
  return {
    id: String(row.id),
    name: row.full_name ?? row.name ?? "",
    grade: row.grade ?? "",
    section: row.section ?? "",
    entryCode: row.entry_code ?? row.entryCode ?? "",
  };
}

export async function getStudents(): Promise<StudentRecord[]> {
  const { data, error } = await supabase
    .from("students")
    .select("id, full_name, grade, section, entry_code")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toStudentRecord);
}

export async function saveStudents(students: StudentRecord[]) {
  const rows = students.map((student) => ({
    id: student.id || makeId("student"),
    full_name: student.name,
    grade: student.grade,
    section: student.section,
    entry_code: student.entryCode,
    updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return;
  const { error } = await supabase.from("students").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

export async function deleteStudent(id: string) {
  const { error } = await supabase.from("students").delete().eq("id", id);
  if (error) throw error;
}

export type StudentSearchResult = StudentRecord & { nationalId: string; status: string };

function toStudentSearchResult(row: any): StudentSearchResult {
  return {
    id: String(row.id),
    name: row.full_name ?? "",
    grade: row.grade ?? "",
    section: row.section ?? "",
    entryCode: row.entry_code ?? "",
    nationalId: row.national_id ?? "",
    status: row.status ?? "active",
  };
}

/**
 * Fetch every row of students, bypassing PostgREST's default 1000-row cap via
 * range-paginated requests with a deterministic (name, id) sort so no row is
 * duplicated or skipped between pages. Used by /students, which needs the
 * full roster rather than a capped/searched subset.
 */
export async function getAllStudents(): Promise<StudentSearchResult[]> {
  const pageSize = 1000;
  const all: StudentSearchResult[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("students")
      .select("id, full_name, grade, section, entry_code, national_id, status")
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;

    const rows = data ?? [];
    all.push(...rows.map(toStudentSearchResult));

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

/** Server-side search over name / entry code (used as "رقم الطالب" — the schema has
 * no separate student-number column) / national ID / grade / section, capped by
 * `limit` so a large student body never gets fetched in one go. */
export async function searchStudents(query: string, limit = 20): Promise<StudentSearchResult[]> {
  const q = query.trim().replace(/[%,]/g, "");

  let builder = supabase
    .from("students")
    .select("id, full_name, grade, section, entry_code, national_id, status")
    .order("full_name", { ascending: true })
    .limit(limit);

  if (q) {
    builder = builder.or(
      `full_name.ilike.%${q}%,entry_code.ilike.%${q}%,national_id.ilike.%${q}%,grade.ilike.%${q}%,section.ilike.%${q}%`
    );
  }

  const { data, error } = await builder;
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    name: row.full_name ?? "",
    grade: row.grade ?? "",
    section: row.section ?? "",
    entryCode: row.entry_code ?? "",
    nationalId: row.national_id ?? "",
    status: row.status ?? "active",
  }));
}
