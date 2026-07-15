import { randomUUID } from "crypto";
import type { ConflictMode, ExcelStudentRecord } from "./types";

export type BatchResult = {
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
  errors: Array<{ record: ExcelStudentRecord; message: string }>;
};

/**
 * Imports one batch of students against the real students table.
 *
 * Atomicity note: new records are written with a single bulk `.insert()`
 * call -- one SQL statement, atomic by nature (if any row in it violates a
 * constraint, the whole statement rolls back and none of that batch's new
 * records are written; no unique constraint on national_id is required for
 * this part). Records matching an existing student (by national_id) are
 * updated individually, since Postgres upsert-on-conflict would need a
 * unique constraint on students.national_id that is not guaranteed to exist
 * on every environment this runs against. Each individual update is still
 * fully atomic on its own row -- there is no "half-updated" row -- and every
 * outcome (inserted/updated/skipped/rejected) is captured and returned, so a
 * caller never silently loses track of what happened. If the bulk insert
 * itself fails, this throws and the caller (the noor-import API route,
 * driven batch-by-batch by the client -- see /noor-import/page.tsx) stops
 * the whole import immediately rather than continuing past an unreported
 * failure.
 */
export async function persistStudentBatch(students: ExcelStudentRecord[], conflictMode: ConflictMode, supabase: any): Promise<BatchResult> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let rejected = 0;
  const errors: Array<{ record: ExcelStudentRecord; message: string }> = [];

  const withId = students.filter((s) => s.national_id);
  const withoutId = students.filter((s) => !s.national_id);

  const existingByNationalId = new Map<string, string>();
  if (withId.length) {
    const nationalIds = Array.from(new Set(withId.map((s) => s.national_id as string)));
    const { data: existingRows, error: lookupError } = await supabase.from("students").select("id, national_id").in("national_id", nationalIds);
    if (lookupError) throw lookupError;
    (existingRows ?? []).forEach((row: any) => existingByNationalId.set(row.national_id, row.id));
  }

  const toInsert: Array<{ id: string; full_name: string; grade: string | null; section: string | null; national_id: string | null; status: string }> = [];

  for (const student of withId) {
    const existingId = existingByNationalId.get(student.national_id as string);

    if (existingId) {
      if (conflictMode === "ignore") {
        skipped += 1;
        continue;
      }

      const { error: updateError } = await supabase
        .from("students")
        .update({
          full_name: student.full_name,
          grade: student.grade ?? null,
          section: student.section ?? null,
          status: student.status ?? "active",
        })
        .eq("id", existingId);

      if (updateError) {
        rejected += 1;
        errors.push({ record: student, message: updateError.message || String(updateError) });
        continue;
      }

      updated += 1;
      continue;
    }

    toInsert.push({
      id: randomUUID(),
      full_name: student.full_name,
      grade: student.grade ?? null,
      section: student.section ?? null,
      national_id: student.national_id,
      status: student.status ?? "active",
    });
  }

  for (const student of withoutId) {
    toInsert.push({
      id: randomUUID(),
      full_name: student.full_name,
      grade: student.grade ?? null,
      section: student.section ?? null,
      national_id: null,
      status: student.status ?? "active",
    });
  }

  if (toInsert.length) {
    const { error: insertError } = await supabase.from("students").insert(toInsert);
    if (insertError) throw insertError;
    inserted += toInsert.length;
  }

  return { inserted, updated, skipped, rejected, errors };
}
