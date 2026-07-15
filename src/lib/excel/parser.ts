import * as XLSX from "xlsx";
import { buildMappingFromHeaders, detectContextValues, detectSheetColumns } from "./detector";
import type { ColumnMapping, ParsedSheetResult, ParsedWorkbookResult, ExcelSheetRow, ExcelStudentRecord } from "./types";

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Converts Arabic-Indic (٠-٩) and Persian (۰-۹) digits to ASCII so national
 * IDs / entry codes typed in either script are recognized identically. */
function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (ch) => {
    const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(ch);
    if (arabicIndex >= 0) return String(arabicIndex);
    const persianIndex = PERSIAN_DIGITS.indexOf(ch);
    if (persianIndex >= 0) return String(persianIndex);
    return ch;
  });
}

/** Neutralizes CSV/Excel formula injection (OWASP): a cell value that would
 * be re-opened in Excel and starts with =, +, -, or @ can execute as a
 * formula. Prefixing with a leading apostrophe forces spreadsheet apps to
 * treat it as literal text, and is applied at the earliest possible point
 * (right when a cell is read out of the untrusted file) so it protects both
 * this page's own preview table and anything downstream that later reads
 * these values back out of students. */
function sanitizeFormulaInjection(value: string): string {
  if (/^[=+\-@]/.test(value)) return `'${value}`;
  return value;
}

function cleanCell(value: unknown): string {
  const text = String(value ?? "").toString().replace(/\s+/g, " ").trim();
  return sanitizeFormulaInjection(normalizeDigits(text));
}

function getCell(row: ExcelSheetRow | undefined, index: number): string {
  if (!row) return "";
  return cleanCell(row[index]);
}

function parseRowsFromSheet(sheet: XLSX.WorkSheet): ExcelSheetRow[] {
  return (XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as unknown[][]).map((row) => row as ExcelSheetRow);
}

function extractRecordsFromRows(
  rows: ExcelSheetRow[],
  detection: ReturnType<typeof detectSheetColumns>,
  mapping: Partial<Record<"name" | "nationalId" | "grade" | "section" | "status", number>>,
  fallbackGrade: string | null,
  fallbackSection: string | null,
  sheetName: string,
): ExcelStudentRecord[] {
  if (!detection) return [];

  const records: ExcelStudentRecord[] = [];
  const headerRowIndex = detection.headerRowIndex;

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const fullName = getCell(row, mapping.name ?? -1);
    const nationalId = getCell(row, mapping.nationalId ?? -1);
    const rawGrade = getCell(row, mapping.grade ?? -1);
    const rawSection = getCell(row, mapping.section ?? -1);
    const grade = rawGrade || fallbackGrade || detection.detectedGrade || null;
    const section = rawSection || fallbackSection || detection.detectedSection || null;
    const status = getCell(row, mapping.status ?? -1) || null;

    // A row with no data anywhere (every mapped cell empty) is not a record
    // to reject with a reason -- it's a genuinely blank spreadsheet row, not
    // present in the file's actual data. A row that has *some* data but is
    // missing the name is still pushed through (with an empty full_name) so
    // the validator rejects it with a clear, visible reason ("الاسم إلزامي")
    // instead of it silently vanishing with no trace.
    if (!fullName.trim() && !nationalId.trim() && !rawGrade.trim() && !rawSection.trim()) continue;

    records.push({
      full_name: fullName.trim(),
      grade: grade || null,
      section: section || null,
      national_id: nationalId || null,
      status: status || null,
      source_sheet: sheetName,
      source_row: rowIndex + 1,
    });
  }

  return records;
}

export async function parseWorkbookBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  explicitMapping?: ColumnMapping,
  fallbackGrade?: string | null,
  fallbackSection?: string | null,
): Promise<ParsedWorkbookResult> {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheets: ParsedSheetResult[] = [];
  const allRecords: ExcelStudentRecord[] = [];
  const headers: string[] = [];
  const warnings: string[] = [];
  const gradeCandidates = new Set<string>();
  const sectionCandidates = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = parseRowsFromSheet(sheet);
    const detection = detectSheetColumns(rows, sheetName);
    const headerRow = rows[detection?.headerRowIndex ?? 0] ?? [];
    const mapping = detection
      ? buildMappingFromHeaders(headerRow.map((cell) => String(cell ?? "").trim()), explicitMapping)
      : buildMappingFromHeaders((rows[0] ?? []).map((cell) => String(cell ?? "").trim()), explicitMapping);
    const sheetRecords = extractRecordsFromRows(rows, detection, mapping, fallbackGrade ?? null, fallbackSection ?? null, sheetName);

    if (sheetRecords.length) {
      allRecords.push(...sheetRecords);
    }

    if (detection?.availableHeaders?.length) {
      headers.push(...detection.availableHeaders);
    }

    const context = detectContextValues(rows, detection?.headerRowIndex ?? null);
    context.gradeCandidates.forEach((value) => gradeCandidates.add(value));
    context.sectionCandidates.forEach((value) => sectionCandidates.add(value));

    sheets.push({
      sheetName,
      rows,
      detection,
      records: sheetRecords,
      rowCount: rows.length,
    });
  }

  const detectedMapping: ColumnMapping = {};
  const firstSheet = sheets.find((sheet) => sheet.detection);
  if (firstSheet?.detection) {
    for (const field of Object.keys(firstSheet.detection.columnMap) as Array<keyof ColumnMapping>) {
      const index = firstSheet.detection.columnMap[field];
      if (typeof index === "number") {
        detectedMapping[field] = firstSheet.detection.availableHeaders[index] ?? null;
      }
    }
  }

  const requiresMapping = sheets.every((sheet) => !sheet.detection || Object.keys(sheet.detection.columnMap).length < 2);

  if (!sheets.length) {
    warnings.push(`لم يتم العثور على أي ورقة قابلة للقراءة في ${fileName}.`);
  }

  if (requiresMapping) {
    warnings.push("لم يتم التعرف على الأعمدة المطلوبة تلقائيًا، وسيحتاج المستخدم إلى مطابقة الأعمدة يدويًا.");
  }

  const firstDetection = firstSheet?.detection ?? null;

  return {
    sheets,
    records: allRecords,
    headers: Array.from(new Set(headers)).filter(Boolean),
    requiresMapping,
    detectedMapping,
    // propagate detected context from the first sheet (fallbacks are handled by the caller)
    detectedGrade: firstDetection?.detectedGrade ?? null,
    detectedSection: firstDetection?.detectedSection ?? null,
    gradeCandidates: Array.from(gradeCandidates),
    sectionCandidates: Array.from(sectionCandidates),
    warnings,
  };
}
