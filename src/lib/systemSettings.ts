import { supabase } from "@/lib/supabase";

export type SystemSettings = {
  rowsPerPage: number;
  updatedAt: string | null;
};

export const MIN_ROWS_PER_PAGE = 5;
export const MAX_ROWS_PER_PAGE = 100;
const DEFAULT_ROWS_PER_PAGE = 10;

// system_settings (migration 019) may not exist yet — see the identical note in
// notificationSettings.ts.
let tableKnownMissing = false;

export async function getSystemSettings(): Promise<SystemSettings | null> {
  if (tableKnownMissing) return null;

  const { data, error } = await supabase.from("system_settings").select("*").eq("id", true).maybeSingle();
  if (error) {
    tableKnownMissing = true;
    return null;
  }
  if (!data) return null;
  return { rowsPerPage: Number(data.rows_per_page ?? DEFAULT_ROWS_PER_PAGE), updatedAt: data.updated_at ?? null };
}

/** Used by pages that paginate (currently /audit-log) to size their pages from
 * the configured value. Falls back to the default if the table isn't there yet
 * (pre-migration) or unreadable — never throws. */
export async function getConfiguredRowsPerPage(): Promise<number> {
  try {
    const settings = await getSystemSettings();
    if (!settings) return DEFAULT_ROWS_PER_PAGE;
    return Math.min(MAX_ROWS_PER_PAGE, Math.max(MIN_ROWS_PER_PAGE, settings.rowsPerPage));
  } catch {
    return DEFAULT_ROWS_PER_PAGE;
  }
}

export function validateRowsPerPage(value: number): string | null {
  if (!Number.isInteger(value) || value < MIN_ROWS_PER_PAGE || value > MAX_ROWS_PER_PAGE) {
    return `عدد الصفوف يجب أن يكون بين ${MIN_ROWS_PER_PAGE} و${MAX_ROWS_PER_PAGE}.`;
  }
  return null;
}

export async function saveSystemSettings(input: { rowsPerPage: number; actorId: string }) {
  const validationError = validateRowsPerPage(input.rowsPerPage);
  if (validationError) throw new Error(validationError);

  return supabase.from("system_settings").update({ rows_per_page: input.rowsPerPage, updated_by: input.actorId }).eq("id", true);
}
