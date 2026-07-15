import { supabase } from "@/lib/supabase";

export type AuditLogRecord = {
  id: string;
  actorId: string | null;
  actorName: string;
  actorRole: string | null;
  action: string;
  details: string;
  studentId: string | null;
  studentActionId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditEntityType = "student" | "student_action" | "system";

export type AuditLogFilters = {
  search?: string;
  actorRole?: string;
  action?: string;
  entityType?: AuditEntityType;
  dateFrom?: string;
  dateTo?: string;
};

export type AuditLogsPageResult = {
  rows: AuditLogRecord[];
  total: number;
};

function toAuditLogRecord(row: any): AuditLogRecord {
  return {
    id: String(row.id),
    actorId: row.actor_id ?? null,
    actorName: row.actor_name ?? "",
    actorRole: row.actor_role ?? null,
    action: row.action ?? "",
    details: row.details ?? "",
    studentId: row.student_id ?? null,
    studentActionId: row.student_action_id ?? null,
    oldValues: row.old_values ?? null,
    newValues: row.new_values ?? null,
    createdAt: row.created_at,
  };
}

function applyAuditLogFilters(query: any, filters: AuditLogFilters) {
  if (filters.actorRole) query = query.eq("actor_role", filters.actorRole);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.entityType === "student_action") {
    query = query.not("student_action_id", "is", null);
  } else if (filters.entityType === "student") {
    query = query.not("student_id", "is", null).is("student_action_id", null);
  } else if (filters.entityType === "system") {
    query = query.is("student_id", null).is("student_action_id", null);
  }
  if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00`);
  if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`);
  if (filters.search) {
    const q = filters.search.trim().replace(/[%,]/g, "");
    if (q) query = query.or(`actor_name.ilike.%${q}%,details.ilike.%${q}%,action.ilike.%${q}%`);
  }
  return query;
}

/** Writes an audit entry. Never throws — a failure to log must not block the
 * primary user action (creating/updating a student action) from succeeding.
 * actor_id is always the caller's own id; RLS (audit_logs_insert_self_attributed)
 * independently rejects any attempt to attribute a row to someone else. */
export async function writeAuditLog(input: {
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  details?: string;
  studentId?: string;
  studentActionId?: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}) {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      actor_id: input.actorId,
      actor_name: input.actorName,
      actor_role: input.actorRole,
      action: input.action,
      details: input.details ?? "",
      student_id: input.studentId ?? null,
      student_action_id: input.studentActionId ?? null,
      old_values: input.oldValues ?? null,
      new_values: input.newValues ?? null,
    });
    if (error) console.error("AUDIT LOG ERROR:", error);
  } catch (error) {
    console.error("AUDIT LOG ERROR:", error);
  }
}

export async function getStudentActionAuditLogs(studentActionId: string): Promise<AuditLogRecord[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("student_action_id", studentActionId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toAuditLogRecord);
}

/** Real (range-based) pagination for the operations log page: fetches only one
 * page of rows at a time plus an exact total count, instead of pulling every
 * matching record into the browser. RLS (audit_logs_select_managers) already
 * scopes this to principal/admin/vice_principal — teachers and students get an
 * empty result set, matched by the page's own role gate. */
export async function getAuditLogsPage(
  filters: AuditLogFilters = {},
  page = 1,
  pageSize = 10
): Promise<AuditLogsPageResult> {
  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  query = applyAuditLogFilters(query, filters);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return { rows: (data ?? []).map(toAuditLogRecord), total: count ?? 0 };
}

const EXPORT_ROW_CAP = 2000;

/** Fetches up to EXPORT_ROW_CAP rows (same filters/order as the page view) for
 * CSV export, bypassing the on-screen pagination window. Returns `truncated:
 * true` when more rows matched than the cap, so the caller can warn the user
 * instead of silently exporting a partial/misleading file. */
export async function getAuditLogsForExport(
  filters: AuditLogFilters = {}
): Promise<{ rows: AuditLogRecord[]; truncated: boolean }> {
  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(EXPORT_ROW_CAP + 1);

  query = applyAuditLogFilters(query, filters);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []).map(toAuditLogRecord);
  const truncated = rows.length > EXPORT_ROW_CAP;
  return { rows: truncated ? rows.slice(0, EXPORT_ROW_CAP) : rows, truncated };
}
