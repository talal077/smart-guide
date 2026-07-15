import type { ColumnMapping, ExcelImportField, ExcelSheetRow, SheetDetection } from "./types";

const FIELD_SYNONYMS: Record<ExcelImportField, string[]> = {
  name: ["الاسم", "اسم الطالب", "الطالب", "student name", "student", "name"],
  nationalId: [
    "الهوية",
    "رقم الهوية",
    "السجل المدني",
    "رقم السجل المدني",
    "رقم السجل",
    "الاقامة",
    "رقم الاقامة",
    "national id",
    "id",
    "identification",
    "civil id",
  ],
  grade: ["الصف", "المرحلة", "grade", "class level", "level"],
  section: ["الفصل", "الشعبة", "class", "section", "الشعبة الدراسية", "الفصل الدراسي"],
  status: ["الحالة", "حالة الطالب", "الحالة الدراسية", "status", "student status"],
};

const BLOCKED_TERMS = [
  "وزارة التعليم",
  "المملكة العربية السعودية",
  "الإدارة",
  "المدرسة",
  "كشف الطلاب",
  "التقارير",
  "report",
  "school",
  "students",
  "logo",
  "header",
  "footer",
];

/** Folds hamza variants (أ/إ/آ/ٱ -> ا), ta marbuta (ة -> ه) and alef maksura (ى -> ي)
 * on top of diacritic stripping, so column headers like "الإسم"/"الاسم" or
 * "الهويه"/"الهوية" match the same synonym regardless of spelling variant. */
function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toString()
    .normalize("NFKD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function includesAny(value: unknown, keywords: string[]): boolean {
  const current = normalizeText(value);
  return keywords.some((keyword) => normalizeText(keyword) && current.includes(normalizeText(keyword)));
}

function isBlocked(value: unknown): boolean {
  return BLOCKED_TERMS.some((term) => includesAny(value, [term]));
}

function getCell(row: ExcelSheetRow | undefined, index: number): string {
  if (!row) return "";
  return String(row[index] ?? "").trim();
}

function findValueNearLabel(rows: ExcelSheetRow[], labels: string[], limit = 20, excludeRowIndex: number | null = null): string | null {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, limit); rowIndex += 1) {
    if (rowIndex === excludeRowIndex) continue; // the column-header row itself is never a "context value" row
    const row = rows[rowIndex] ?? [];
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      if (!includesAny(row[colIndex], labels)) continue;
      const rightValue = getCell(row, colIndex + 1);
      if (rightValue && !includesAny(rightValue, labels) && !isBlocked(rightValue)) return rightValue;
      const leftValue = getCell(row, colIndex - 1);
      if (leftValue && !includesAny(leftValue, labels) && !isBlocked(leftValue)) return leftValue;
    }
  }
  return null;
}

export function detectSheetColumns(rows: ExcelSheetRow[], sheetName: string): SheetDetection | null {
  const candidateRows: Array<{ rowIndex: number; columnMap: Partial<Record<ExcelImportField, number>>; score: number }> = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const detected: Partial<Record<ExcelImportField, number>> = {};
    let score = 0;

    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      const cell = row[colIndex];
      if (!cell || isBlocked(cell)) continue;

      for (const field of Object.keys(FIELD_SYNONYMS) as ExcelImportField[]) {
        if (!includesAny(cell, FIELD_SYNONYMS[field])) continue;
        if (detected[field] === undefined) {
          detected[field] = colIndex;
          score += 1;
        }
      }
    }

    if (score > 0) {
      candidateRows.push({ rowIndex, columnMap: detected, score });
    }
  }

  if (!candidateRows.length) {
    return null;
  }

  candidateRows.sort((a, b) => b.score - a.score || a.rowIndex - b.rowIndex);
  const best = candidateRows[0];

  const availableHeaders = (rows[best.rowIndex] ?? []).map((cell) => String(cell ?? "").trim()).filter(Boolean);
  const detectedGrade = findValueNearLabel(rows, ["الصف", "المرحلة", "grade"], 20, best.rowIndex);
  const detectedSection = findValueNearLabel(rows, ["الفصل", "الشعبة", "section", "class"], 20, best.rowIndex);

  return {
    headerRowIndex: best.rowIndex,
    columnMap: best.columnMap,
    availableHeaders,
    detectedGrade: detectedGrade || null,
    detectedSection: detectedSection || null,
    sheetName,
  };
}

export function buildMappingFromHeaders(headers: string[], explicitMapping?: ColumnMapping): Partial<Record<ExcelImportField, number>> {
  const mapping: Partial<Record<ExcelImportField, number>> = {};
  const normalizedHeaders = headers.map((header) => normalizeText(header));

  for (const field of Object.keys(FIELD_SYNONYMS) as ExcelImportField[]) {
    const requestedHeader = explicitMapping?.[field];
    if (requestedHeader) {
      const idx = headers.findIndex((header) => normalizeText(header) === normalizeText(requestedHeader));
      if (idx >= 0) {
        mapping[field] = idx;
        continue;
      }
    }

    const bestIndex = normalizedHeaders.findIndex((header) =>
      Object.values(FIELD_SYNONYMS[field]).some((keyword) => header.includes(normalizeText(keyword)))
    );

    if (bestIndex >= 0) {
      mapping[field] = bestIndex;
    }
  }

  return mapping;
}

export function inferColumnMappingFromDetection(detection: SheetDetection | null): Partial<Record<ExcelImportField, number>> {
  if (!detection) return {};
  return detection.columnMap;
}

export function detectContextValues(rows: ExcelSheetRow[], excludeRowIndex: number | null = null): { gradeCandidates: string[]; sectionCandidates: string[] } {
  const gradeCandidates = new Set<string>();
  const sectionCandidates = new Set<string>();

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 25); rowIndex += 1) {
    if (rowIndex === excludeRowIndex) continue; // the column-header row itself is never a "context value" row
    const row = rows[rowIndex] ?? [];
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      const cell = row[colIndex];
      if (includesAny(cell, ["الصف", "المرحلة", "grade"])) {
        const value = getCell(row, colIndex + 1);
        if (value && !isBlocked(value)) gradeCandidates.add(value.trim());
      }
      if (includesAny(cell, ["الفصل", "الشعبة", "section", "class"])) {
        const value = getCell(row, colIndex + 1);
        if (value && !isBlocked(value)) sectionCandidates.add(value.trim());
      }
    }
  }

  return {
    gradeCandidates: Array.from(gradeCandidates),
    sectionCandidates: Array.from(sectionCandidates),
  };
}
