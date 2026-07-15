import { redirect } from "next/navigation";

// This route predates /notifications and was never wired into any nav item or
// link — /notifications is the one real, RLS-backed notifications center.
// Redirect here instead of deleting the route outright, in case anything
// external still links to the old path.
export default function NotificationsCenterPage() {
  redirect("/notifications");
}
