import { createClient } from "@/lib/supabase";

const supabase = createClient();

export function subscribeAttendance(callback: () => void) {
  return supabase
    .channel("attendance-channel")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "attendance_records",
      },
      callback
    )
    .subscribe();
}

export function subscribeNotifications(callback: () => void) {
  return supabase
    .channel("notifications-channel")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
      },
      callback
    )
    .subscribe();
}

export function subscribeAuditLogs(callback: () => void) {
  return supabase
    .channel("audit-channel")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "audit_logs",
      },
      callback
    )
    .subscribe();
}

export function unsubscribe(channel: any) {
  supabase.removeChannel(channel);
}