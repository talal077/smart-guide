import { createClient } from "@supabase/supabase-js";
import { QA_USERS } from "./setup/qa-user";
import { REPORTS_SCOPE_MARKER } from "./setup/reports-scope-fixture";

/** Removes every throwaway QA account created by global-setup.ts. */
export default async function globalTeardown() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return;

  const admin = createClient(url, serviceRole);
  const { data } = await admin.auth.admin.listUsers();
  const qaEmails = new Set(Object.values(QA_USERS).map((u) => u.email));

  for (const user of data?.users ?? []) {
    if (!user.email || !qaEmails.has(user.email)) continue;
    await admin.from("profiles").delete().eq("id", user.id);
    await admin.auth.admin.deleteUser(user.id);
  }

  await admin.from("attendance_records").delete().eq("grade", REPORTS_SCOPE_MARKER);
  await admin.from("students").delete().eq("grade", REPORTS_SCOPE_MARKER);
  await admin.from("sections").delete().eq("name", REPORTS_SCOPE_MARKER);
}
