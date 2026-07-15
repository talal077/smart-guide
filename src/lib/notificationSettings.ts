import { supabase } from "@/lib/supabase";

export type NotificationSettings = {
  unsubmittedAlertsEnabled: boolean;
  studentActionAlertsEnabled: boolean;
  adminAlertsEnabled: boolean;
  pollingSeconds: number;
  updatedAt: string | null;
};

export const MIN_POLLING_SECONDS = 15;
export const MAX_POLLING_SECONDS = 300;
const DEFAULT_POLLING_SECONDS = 45;

function toNotificationSettings(row: any): NotificationSettings {
  return {
    unsubmittedAlertsEnabled: row.unsubmitted_alerts_enabled ?? true,
    studentActionAlertsEnabled: row.student_action_alerts_enabled ?? true,
    adminAlertsEnabled: row.admin_alerts_enabled ?? true,
    pollingSeconds: Number(row.polling_seconds ?? DEFAULT_POLLING_SECONDS),
    updatedAt: row.updated_at ?? null,
  };
}

// notification_settings (migration 019) may not exist yet on this database.
// NotificationBell mounts on every page and /notifications polls repeatedly, so
// once a missing-table error is seen, stop re-attempting for the rest of the
// session instead of re-failing (and re-logging) the same request repeatedly —
// pure noise reduction, callers already treat "null"/defaults identically either way.
let tableKnownMissing = false;

export async function getNotificationSettings(): Promise<NotificationSettings | null> {
  if (tableKnownMissing) return null;

  const { data, error } = await supabase.from("notification_settings").select("*").eq("id", true).maybeSingle();
  if (error) {
    tableKnownMissing = true;
    return null;
  }
  if (!data) return null;
  return toNotificationSettings(data);
}

/** Used by NotificationBell / /notifications' poll interval so the configured
 * duration actually takes effect. Falls back to the safe default if the table
 * doesn't exist yet (pre-migration) or the row can't be read for any reason —
 * never throws, since a missing/misreadable setting must not break polling. */
export async function getNotificationPollingMs(): Promise<number> {
  try {
    const settings = await getNotificationSettings();
    if (!settings) return DEFAULT_POLLING_SECONDS * 1000;
    const bounded = Math.min(MAX_POLLING_SECONDS, Math.max(MIN_POLLING_SECONDS, settings.pollingSeconds));
    return bounded * 1000;
  } catch {
    return DEFAULT_POLLING_SECONDS * 1000;
  }
}

/** Used by the student-actions request-creation flow to decide whether to create
 * the teacher-facing notification at all. Defaults to true (never silently drops
 * notifications just because the settings table isn't reachable). */
export async function areStudentActionAlertsEnabled(): Promise<boolean> {
  try {
    const settings = await getNotificationSettings();
    return settings?.studentActionAlertsEnabled ?? true;
  } catch {
    return true;
  }
}

export function validateNotificationSettings(pollingSeconds: number): string | null {
  if (!Number.isInteger(pollingSeconds) || pollingSeconds < MIN_POLLING_SECONDS || pollingSeconds > MAX_POLLING_SECONDS) {
    return `مدة التحديث الدوري يجب أن تكون بين ${MIN_POLLING_SECONDS} و${MAX_POLLING_SECONDS} ثانية.`;
  }
  return null;
}

export async function saveNotificationSettings(input: {
  unsubmittedAlertsEnabled: boolean;
  studentActionAlertsEnabled: boolean;
  adminAlertsEnabled: boolean;
  pollingSeconds: number;
  actorId: string;
}) {
  const validationError = validateNotificationSettings(input.pollingSeconds);
  if (validationError) throw new Error(validationError);

  return supabase
    .from("notification_settings")
    .update({
      unsubmitted_alerts_enabled: input.unsubmittedAlertsEnabled,
      student_action_alerts_enabled: input.studentActionAlertsEnabled,
      admin_alerts_enabled: input.adminAlertsEnabled,
      polling_seconds: input.pollingSeconds,
      updated_by: input.actorId,
    })
    .eq("id", true);
}
