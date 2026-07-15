export type ExcelImportField = "name" | "nationalId" | "grade" | "section" | "status";

export type ExcelCellValue = string | number | boolean | Date | null | undefined;
export type ExcelSheetRow = ExcelCellValue[];

export type ExcelStudentRecord = {
  full_name: string;
  grade: string | null;
  section: string | null;
  national_id: string | null;
  status: string | null;
  source_sheet?: string;
  source_row?: number;
};

export type ColumnMapping = Partial<Record<ExcelImportField, string | null>>;

export type ConflictMode = "update" | "ignore";

export type SheetDetection = {
  headerRowIndex: number;
  columnMap: Partial<Record<ExcelImportField, number>>;
  availableHeaders: string[];
  detectedGrade: string | null;
  detectedSection: string | null;
  sheetName: string;
};

export type ParsedSheetResult = {
  sheetName: string;
  rows: ExcelSheetRow[];
  detection: SheetDetection | null;
  records: ExcelStudentRecord[];
  rowCount: number;
};

export type ParsedWorkbookResult = {
  sheets: ParsedSheetResult[];
  records: ExcelStudentRecord[];
  headers: string[];
  requiresMapping: boolean;
  detectedMapping: ColumnMapping;
  detectedGrade: string | null;
  detectedSection: string | null;
  gradeCandidates: string[];
  sectionCandidates: string[];
  warnings: string[];
};

export type ValidationIssue = {
  rowNumber: number;
  message: string;
  record: ExcelStudentRecord;
};

export type ValidationResult = {
  records: ExcelStudentRecord[];
  duplicates: ExcelStudentRecord[];
  issues: ValidationIssue[];
  duplicateCount: number;
  errorCount: number;
};

export type ImportPreview = {
  totalStudents: number;
  totalRows: number;
  previewRows: ExcelStudentRecord[];
  uniqueSections: number;
  duplicateCount: number;
  errorCount: number;
  existingCount: number;
  issues: ValidationIssue[];
  duplicateRecords: ExcelStudentRecord[];
  requiresMapping: boolean;
  detectedMapping: ColumnMapping;
  detectedGrade: string | null;
  detectedSection: string | null;
  gradeCandidates: string[];
  sectionCandidates: string[];
  warnings: string[];
  sheetNames: string[];
  availableHeaders: string[];
};

export type ImportReport = {
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
  errors: Array<{ record: ExcelStudentRecord; message: string }>;
  summary: string;
  outcome: "success" | "partial" | "failed";
};
