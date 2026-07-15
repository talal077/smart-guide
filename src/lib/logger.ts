import { createClient } from "@/lib/supabase";

const supabase = createClient();

export async function writeLog(
  userName: string,
  action: string,
  details = ""
) {
  try {
    await supabase.from("audit_logs").insert({
      user_name: userName,
      action,
      details,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("LOG ERROR:", error);
  }
}

export async function writeNotification(
  title: string,
  message: string
) {
  try {
    await supabase.from("notifications").insert({
      title,
      message,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("NOTIFICATION ERROR:", error);
  }
}