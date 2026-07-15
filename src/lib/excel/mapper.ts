import type { ColumnMapping, ExcelImportField } from "./types";

export function createDefaultMapping(): ColumnMapping {
  return {
    name: null,
    nationalId: null,
    grade: null,
    section: null,
    status: null,
  };
}

export function isMappingComplete(mapping: ColumnMapping): boolean {
  return Boolean(mapping.name) || Boolean(mapping.nationalId) || Boolean(mapping.grade) || Boolean(mapping.section);
}

export function getRequiredFields(mapping: ColumnMapping): ExcelImportField[] {
  const required: ExcelImportField[] = [];
  if (!mapping.name) required.push("name");
  return required;
}
