import { supabase } from "@/lib/supabase";

export type NotificationRecord = {
  id: string;
  title: string;
  body: string;
  role: string | null;
  userId: string | null;
  isRead: boolean;
  type: string | null;
  studentActionId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type NotificationFilters = {
  type?: string;
  status?: "unread" | "read";
  date?: string;
  search?: string;
};

export type NotificationsPageResult = {
  rows: NotificationRecord[];
  total: number;
};

function toNotificationRecord(row: any): NotificationRecord {
  return {
    id: String(row.id),
    title: row.title ?? "",
    body: row.body ?? "",
    role: row.role ?? null,
    userId: row.user_id ?? null,
    isRead: !!row.is_read,
    type: row.type ?? null,
    studentActionId: row.student_action_id ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.created_at,
  };
}

// Lightweight in-tab event bus so the bell counter (mounted in AppShell) can
// react instantly to reads/creates triggered elsewhere on the page, instead of
// waiting for its next poll tick. Cross-tab updates still rely on polling.
type Listener = () => void;
const listeners = new Set<Listener>();

export function onNotificationsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitNotificationsChanged() {
  for (const listener of listeners) listener();
}

function applyNotificationFilters(query: any, filters: NotificationFilters) {
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.status === "unread") query = query.eq("is_read", false);
  if (filters.status === "read") query = query.eq("is_read", true);
  if (filters.date) query = query.gte("created_at", `${filters.date}T00:00:00`).lte("created_at", `${filters.date}T23:59:59.999`);
  if (filters.search) {
    const q = filters.search.trim().replace(/[%,]/g, "");
    if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`);
  }
  return query;
}

/** RLS scopes this to notifications addressed to the current user (by user_id),
 * broadcast to their role (user_id null + matching role), or all of them if the
 * current user is a manager. */
export async function getMyNotifications(limit = 100): Promise<NotificationRecord[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toNotificationRecord);
}

/** Real (range-based) pagination for the notifications center: fetches only one
 * page at a time plus an exact total count, instead of pulling every matching
 * row into the browser. */
export async function getMyNotificationsPage(
  filters: NotificationFilters = {},
  page = 1,
  pageSize = 10
): Promise<NotificationsPageResult> {
  let query = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  query = applyNotificationFilters(query, filters);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return { rows: (data ?? []).map(toNotificationRecord), total: count ?? 0 };
}

/** Count of unread notifications visible to the current user (RLS-scoped),
 * used to drive the bell badge without loading the notifications themselves. */
export async function getUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  if (error) throw error;
  emitNotificationsChanged();
}

/** Marks every currently-unread notification addressed to the signed-in user as
 * read. Broadcast (user_id IS NULL) rows are intentionally excluded: RLS's
 * notifications_update_own policy only allows updating rows where
 * user_id = auth.uid(), and no broadcast row exists in the current student-action
 * notification flow (every createNotification call sets a concrete userId). */
export async function markAllNotificationsRead(): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return;

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userData.user.id)
    .eq("is_read", false);
  if (error) throw error;
  emitNotificationsChanged();
}

export async function createNotification(input: {
  title: string;
  body: string;
  role?: string | null;
  userId: string;
  type: string;
  studentActionId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabase.from("notifications").insert({
    title: input.title,
    body: input.body,
    role: input.role ?? null,
    user_id: input.userId,
    type: input.type,
    student_action_id: input.studentActionId ?? null,
    metadata: input.metadata ?? null,
    is_read: false,
  });
  if (error) throw error;
  emitNotificationsChanged();
}
