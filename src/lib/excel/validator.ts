import type { ExcelStudentRecord, ValidationIssue, ValidationResult } from "./types";

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** Keeps only digits (Arabic-Indic digits are already converted to ASCII by
 * the parser before this runs). A value that had content but normalizes to
 * nothing (pure non-numeric junk) is dropped rather than rejecting the whole
 * record -- only the name is a hard requirement. */
function normalizeNationalId(value: string | null | undefined): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  const digitsOnly = text.replace(/[^0-9]/g, "");
  return digitsOnly || null;
}

export function validateStudents(records: ExcelStudentRecord[]): ValidationResult {
  const cleaned: ExcelStudentRecord[] = [];
  const issues: ValidationIssue[] = [];
  const duplicates: ExcelStudentRecord[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const normalizedName = normalizeText(record.full_name);
    const normalizedGrade = normalizeText(record.grade);
    const normalizedSection = normalizeText(record.section);
    const normalizedNationalId = normalizeNationalId(record.national_id);
    const normalizedStatus = normalizeText(record.status);

    if (!normalizedName) {
      issues.push({ rowNumber: record.source_row ?? index + 2, message: "الاسم إلزامي", record });
      continue;
    }

    const cleanedRecord: ExcelStudentRecord = {
      full_name: normalizedName,
      grade: normalizedGrade || null,
      section: normalizedSection || null,
      national_id: normalizedNationalId,
      status: normalizedStatus || null,
      source_sheet: record.source_sheet,
      source_row: record.source_row,
    };

    const dedupeKey = cleanedRecord.national_id
      ? `id:${cleanedRecord.national_id}`
      : `name:${cleanedRecord.full_name}|${cleanedRecord.grade || ""}|${cleanedRecord.section || ""}`;

    if (seen.has(dedupeKey)) {
      duplicates.push(cleanedRecord);
      continue;
    }

    seen.add(dedupeKey);
    cleaned.push(cleanedRecord);
  }

  return {
    records: cleaned,
    duplicates,
    issues,
    duplicateCount: duplicates.length,
    errorCount: issues.length,
  };
}
