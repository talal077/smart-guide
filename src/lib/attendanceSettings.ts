import { supabase } from "@/lib/supabase";

export type AttendanceSettings = {
  presentColor: string;
  absentColor: string;
  lateColor: string;
  excusedColor: string;
  submissionDeadlineMinutes: number;
  lateAlertDelayMinutes: number;
  allowEditAfterSubmit: boolean;
  copyFromPreviousEnabled: boolean;
  defaultAllPresent: boolean;
  updatedAt: string | null;
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function toAttendanceSettings(row: any): AttendanceSettings {
  return {
    presentColor: row.present_color ?? "#16a34a",
    absentColor: row.absent_color ?? "#dc2626",
    lateColor: row.late_color ?? "#f59e0b",
    excusedColor: row.excused_color ?? "#2563eb",
    submissionDeadlineMinutes: Number(row.submission_deadline_minutes ?? 30),
    lateAlertDelayMinutes: Number(row.late_alert_delay_minutes ?? 15),
    allowEditAfterSubmit: !!row.allow_edit_after_submit,
    copyFromPreviousEnabled: !!row.copy_from_previous_enabled,
    defaultAllPresent: !!row.default_all_present,
    updatedAt: row.updated_at ?? null,
  };
}

/** Storage + validation only — not wired into the attendance/absence pages
 * themselves (out of this review's scope; see getReportHeader's note for why). */
export async function getAttendanceSettings(): Promise<AttendanceSettings | null> {
  const { data, error } = await supabase.from("attendance_settings").select("*").eq("id", true).maybeSingle();
  if (error || !data) return null;
  return toAttendanceSettings(data);
}

export function validateAttendanceSettings(input: {
  presentColor: string;
  absentColor: string;
  lateColor: string;
  excusedColor: string;
  submissionDeadlineMinutes: number;
  lateAlertDelayMinutes: number;
}): string | null {
  for (const [label, value] of [
    ["حاضر", input.presentColor],
    ["غائب", input.absentColor],
    ["متأخر", input.lateColor],
    ["مستأذن", input.excusedColor],
  ] as const) {
    if (!HEX_COLOR.test(value)) return `لون حالة "${label}" غير صالح.`;
  }
  if (!Number.isInteger(input.submissionDeadlineMinutes) || input.submissionDeadlineMinutes < 1 || input.submissionDeadlineMinutes > 240) {
    return "المهلة الزمنية لرفع التحضير يجب أن تكون بين 1 و240 دقيقة.";
  }
  if (!Number.isInteger(input.lateAlertDelayMinutes) || input.lateAlertDelayMinutes < 0 || input.lateAlertDelayMinutes > 240) {
    return "وقت ظهور تنبيه عدم الرفع يجب أن يكون بين 0 و240 دقيقة.";
  }
  return null;
}

export async function saveAttendanceSettings(input: {
  presentColor: string;
  absentColor: string;
  lateColor: string;
  excusedColor: string;
  submissionDeadlineMinutes: number;
  lateAlertDelayMinutes: number;
  allowEditAfterSubmit: boolean;
  copyFromPreviousEnabled: boolean;
  defaultAllPresent: boolean;
  actorId: string;
}) {
  const validationError = validateAttendanceSettings(input);
  if (validationError) throw new Error(validationError);

  return supabase
    .from("attendance_settings")
    .update({
      present_color: input.presentColor,
      absent_color: input.absentColor,
      late_color: input.lateColor,
      excused_color: input.excusedColor,
      submission_deadline_minutes: input.submissionDeadlineMinutes,
      late_alert_delay_minutes: input.lateAlertDelayMinutes,
      allow_edit_after_submit: input.allowEditAfterSubmit,
      copy_from_previous_enabled: input.copyFromPreviousEnabled,
      default_all_present: input.defaultAllPresent,
      updated_by: input.actorId,
    })
    .eq("id", true);
}
