import { supabase } from "@/lib/supabase";

export type SchoolStage = { id: string; name: string; sortOrder: number };
export type EducationAdministration = { id: string; name: string };
export type AcademicYear = { id: string; label: string };
export type GradeLevel = { id: string; name: string; sortOrder: number };

export const ACADEMIC_TERMS = ["الفصل الأول", "الفصل الثاني", "الفصل الثالث"] as const;
export type AcademicTerm = (typeof ACADEMIC_TERMS)[number];

export type SchoolSettings = {
  educationAdministrationId: string;
  educationAdministrationName: string;
  schoolName: string;
  stageId: string;
  stageName: string;
  academicYearId: string;
  academicYearLabel: string;
  academicTerm: AcademicTerm | null;
  logoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function getSchoolStages(): Promise<SchoolStage[]> {
  const { data, error } = await supabase
    .from("school_stages")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name), sortOrder: Number(row.sort_order) }));
}

export async function getEducationAdministrations(): Promise<EducationAdministration[]> {
  const { data, error } = await supabase
    .from("education_administrations")
    .select("id, name")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));
}

export async function getAcademicYears(): Promise<AcademicYear[]> {
  const { data, error } = await supabase
    .from("academic_years")
    .select("id, label")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({ id: String(row.id), label: String(row.label) }));
}

export async function getGradeLevelsForStage(stageId: string): Promise<GradeLevel[]> {
  const { data, error } = await supabase
    .from("grade_levels")
    .select("id, name, sort_order")
    .eq("stage_id", stageId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name), sortOrder: Number(row.sort_order) }));
}

type SchoolSettingsRow = {
  education_administration_id: string;
  school_name: string;
  stage_id: string;
  academic_year_id: string;
  academic_term: string | null;
  logo_url: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
  education_administrations: { name: string } | { name: string }[] | null;
  school_stages: { name: string } | { name: string }[] | null;
  academic_years: { label: string } | { label: string }[] | null;
};

function firstOf<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function mapSettingsRow(row: SchoolSettingsRow): SchoolSettings {
  return {
    educationAdministrationId: String(row.education_administration_id),
    educationAdministrationName: String(firstOf(row.education_administrations)?.name ?? ""),
    schoolName: String(row.school_name),
    stageId: String(row.stage_id),
    stageName: String(firstOf(row.school_stages)?.name ?? ""),
    academicYearId: String(row.academic_year_id),
    academicYearLabel: String(firstOf(row.academic_years)?.label ?? ""),
    academicTerm: (row.academic_term as AcademicTerm | null) ?? null,
    logoUrl: row.logo_url ?? null,
    isActive: row.is_active ?? true,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const BASE_SETTINGS_COLUMNS =
  "education_administration_id, school_name, stage_id, academic_year_id, created_at, updated_at, education_administrations(name), school_stages(name), academic_years(label)";
const EXTENDED_SETTINGS_COLUMNS = "academic_term, logo_url, is_active, " + BASE_SETTINGS_COLUMNS;

// AppShell calls getSchoolSettings() on every route change (for the header), so
// once the extended columns are confirmed missing, remember that for the rest of
// the browser session instead of re-attempting (and re-failing) that query on
// every single page navigation — pure noise reduction, not a functional change.
let extendedColumnsKnownMissing = false;

/** AppShell's header (every page) and the first-run setup wizard both depend on
 * this succeeding today, so it must degrade gracefully if academic_term/logo_url/
 * is_active (migration 019, not applied automatically) don't exist yet on this
 * database — falling back to the original column set rather than failing the
 * whole call and blanking the header everywhere. */
export async function getSchoolSettings(): Promise<SchoolSettings | null> {
  if (!extendedColumnsKnownMissing) {
    const extended = await supabase.from("school_settings").select(EXTENDED_SETTINGS_COLUMNS).eq("id", true).maybeSingle();

    if (!extended.error) {
      if (!extended.data) return null;
      return mapSettingsRow(extended.data as unknown as SchoolSettingsRow);
    }

    extendedColumnsKnownMissing = true;
  }

  const base = await supabase.from("school_settings").select(BASE_SETTINGS_COLUMNS).eq("id", true).maybeSingle();
  if (base.error || !base.data) return null;
  return mapSettingsRow({ academic_term: null, logo_url: null, is_active: true, ...(base.data as object) } as unknown as SchoolSettingsRow);
}

export async function isSetupComplete(): Promise<boolean> {
  const { data, error } = await supabase.from("school_settings").select("id").eq("id", true).maybeSingle();
  return !error && !!data;
}

export async function saveSchoolSettings(input: {
  educationAdministrationId: string;
  schoolName: string;
  stageId: string;
  academicYearId: string;
  academicTerm?: AcademicTerm | null;
  logoUrl?: string | null;
  isActive?: boolean;
}) {
  const patch: Record<string, unknown> = {
    id: true,
    education_administration_id: input.educationAdministrationId,
    school_name: input.schoolName,
    stage_id: input.stageId,
    academic_year_id: input.academicYearId,
  };
  const extendedKeys: string[] = [];
  if (input.academicTerm !== undefined) {
    patch.academic_term = input.academicTerm;
    extendedKeys.push("academic_term");
  }
  if (input.logoUrl !== undefined) {
    patch.logo_url = input.logoUrl;
    extendedKeys.push("logo_url");
  }
  if (input.isActive !== undefined) {
    patch.is_active = input.isActive;
    extendedKeys.push("is_active");
  }

  const result = await supabase.from("school_settings").upsert(patch, { onConflict: "id" });

  // If the failure is specifically an unknown-column error for one of the new
  // (migration 019, not-yet-applied) fields, retry without them rather than
  // failing the whole save — school name/admin/stage/year must keep working
  // today regardless of whether that migration has been applied yet. The caller
  // is told via extendedFieldsSkipped so it can be honest about what didn't save.
  if (result.error && extendedKeys.length > 0 && extendedKeys.some((key) => result.error!.message.includes(key))) {
    for (const key of extendedKeys) delete patch[key];
    const retry = await supabase.from("school_settings").upsert(patch, { onConflict: "id" });
    return { ...retry, extendedFieldsSkipped: !retry.error };
  }

  return { ...result, extendedFieldsSkipped: false };
}

export async function getSchoolGrades(): Promise<string[]> {
  const settings = await getSchoolSettings();
  if (!settings) return [];

  const levels = await getGradeLevelsForStage(settings.stageId);
  return levels.map((level) => level.name);
}

const LOGO_BUCKET = "school-logo";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Uploads a new school logo to Supabase Storage (never as base64 in the DB — only
 * the storage path/URL is stored on school_settings). Validates type and size
 * client-side; the bucket's own file_size_limit/allowed_mime_types (migration 019)
 * enforce the same server-side. Rejects SVG outright (unsanitized SVG can carry
 * embedded scripts). */
export async function uploadSchoolLogo(file: File): Promise<string> {
  if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
    throw new Error("صيغة الشعار غير مدعومة. المسموح: PNG أو JPEG أو WEBP فقط.");
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("حجم الشعار كبير جدًا. الحد الأقصى 2 ميجابايت.");
  }

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `logo-${Date.now()}.${extension}`;

  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, { upsert: true, cacheControl: "3600" });
  if (error) throw error;

  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export type ReportHeader = {
  ministryName: string;
  educationAdministrationName: string;
  regionName: string;
  schoolName: string;
  academicYearLabel: string;
  academicTerm: string | null;
  logoUrl: string | null;
};

/** The single source of truth for the official header block that should appear on
 * every PDF/Excel export and printed report: ministry name (fixed) + education
 * administration + region + school name + academic year + term, all sourced live
 * from school_settings rather than hardcoded per-page. Wiring this into the actual
 * exporters (src/lib/reportsExport.ts, analyticsExport.ts,
 * modules/attendance/utils/attendance.export.ts) is out of this review's scope —
 * those files implement التقارير/التحليلات/تحضير الحصص, which this review is
 * explicitly not permitted to touch. */
export async function getReportHeader(): Promise<ReportHeader | null> {
  const settings = await getSchoolSettings();
  if (!settings) return null;

  return {
    ministryName: "وزارة التعليم",
    educationAdministrationName: settings.educationAdministrationName,
    regionName: settings.educationAdministrationName,
    schoolName: settings.schoolName,
    academicYearLabel: settings.academicYearLabel,
    academicTerm: settings.academicTerm,
    logoUrl: settings.logoUrl,
  };
}
