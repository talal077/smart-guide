import { redirect } from "next/navigation";

// This route predates /audit-log and was entirely mock (a hardcoded demoLogs
// array persisted to localStorage) — it never read from Supabase. /audit-log
// is the one real, RLS-backed operations log. Redirect here instead of
// deleting the route outright, in case anything external still links to the
// old path.
export default function OperationsLogPage() {
  redirect("/audit-log");
}
