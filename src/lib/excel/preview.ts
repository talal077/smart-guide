import type { ExcelStudentRecord, ImportPreview, ValidationResult } from "./types";

export function buildImportPreview(
  records: ExcelStudentRecord[],
  validation: ValidationResult,
  detectedMapping: Record<string, string | null>,
  requiresMapping: boolean,
  detectedGrade: string | null,
  detectedSection: string | null,
  gradeCandidates: string[],
  sectionCandidates: string[],
  warnings: string[],
  sheetNames: string[],
  availableHeaders: string[],
): ImportPreview {
  return {
    totalStudents: validation.records.length,
    totalRows: records.length,
    // The full validated record set, not just a display-sized slice: the
    // client actually submits this array for import (see /noor-import
    // page.tsx), and the table there separately slices to 20 rows for
    // rendering. A previous version capped this here, which silently
    // dropped every record past the 20th from the import itself.
    previewRows: validation.records,
    uniqueSections: new Set(validation.records.map((student) => student.section || "غير محدد")).size,
    duplicateCount: validation.duplicateCount,
    errorCount: validation.errorCount,
    existingCount: 0, // filled in by the API route after checking against Supabase
    issues: validation.issues,
    duplicateRecords: validation.duplicates,
    requiresMapping,
    detectedMapping,
    detectedGrade,
    detectedSection,
    gradeCandidates,
    sectionCandidates,
    warnings,
    sheetNames,
    availableHeaders,
  };
}
