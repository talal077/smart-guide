import { supabase } from "@/lib/supabase";

export type StudentActionType = "summon" | "permission" | "entry";
export type StudentActionStatus = "pending" | "completed" | "postponed" | "cancelled";

export type StudentActionRecord = {
  id: string;
  studentId: string;
  studentName: string;
  grade: string;
  section: string;
  type: StudentActionType;
  reason: string;
  lesson: string;
  notes: string | null;
  actionDate: string;
  actionTime: string;
  status: StudentActionStatus;
  requestedBy: string;
  requestedByName: string;
  assignedTeacherId: string;
  assignedTeacherName: string;
  completedAt: string | null;
  completedBy: string | null;
  completedByName: string | null;
  postponedUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudentActionFilters = {
  studentId?: string;
  type?: StudentActionType;
  status?: StudentActionStatus;
  grade?: string;
  section?: string;
  teacherId?: string;
  date?: string;
  studentName?: string;
  search?: string;
};

export type StudentActionsPageResult = {
  rows: StudentActionRecord[];
  total: number;
};

export type CreateStudentActionInput = {
  studentId: string;
  studentName: string;
  grade: string;
  section: string;
  type: StudentActionType;
  reason: string;
  lesson: string;
  notes?: string;
  actionDate: string;
  actionTime: string;
  requestedBy: string;
  assignedTeacherId: string;
};

export type UpdateStudentActionInput = Partial<{
  type: StudentActionType;
  reason: string;
  lesson: string;
  notes: string;
  actionDate: string;
  actionTime: string;
  assignedTeacherId: string;
}>;

const SELECT_WITH_JOINS = `
  *,
  requested_by_profile:profiles!student_actions_requested_by_fkey(full_name),
  assigned_teacher_profile:profiles!student_actions_assigned_teacher_id_fkey(full_name),
  completed_by_profile:profiles!student_actions_completed_by_fkey(full_name)
`;

function toStudentActionRecord(row: any): StudentActionRecord {
  return {
    id: String(row.id),
    studentId: row.student_id ?? "",
    studentName: row.student_name ?? "",
    grade: row.grade ?? "",
    section: row.section ?? "",
    type: row.type,
    reason: row.reason ?? "",
    lesson: row.lesson ?? "",
    notes: row.notes ?? null,
    actionDate: row.action_date ?? "",
    actionTime: row.action_time ?? "",
    status: row.status ?? "pending",
    requestedBy: row.requested_by ?? "",
    requestedByName: row.requested_by_profile?.full_name ?? "",
    assignedTeacherId: row.assigned_teacher_id ?? "",
    assignedTeacherName: row.assigned_teacher_profile?.full_name ?? "",
    completedAt: row.completed_at ?? null,
    completedBy: row.completed_by ?? null,
    completedByName: row.completed_by_profile?.full_name ?? null,
    postponedUntil: row.postponed_until ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function applyFilters(query: any, filters: StudentActionFilters) {
  if (filters.studentId) query = query.eq("student_id", filters.studentId);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.grade) query = query.eq("grade", filters.grade);
  if (filters.section) query = query.eq("section", filters.section);
  if (filters.teacherId) query = query.eq("assigned_teacher_id", filters.teacherId);
  if (filters.date) query = query.eq("action_date", filters.date);
  if (filters.studentName) query = query.ilike("student_name", `%${filters.studentName.trim().replace(/[%,]/g, "")}%`);
  if (filters.search) {
    const q = filters.search.trim().replace(/[%,]/g, "");
    if (q) query = query.or(`reason.ilike.%${q}%,notes.ilike.%${q}%,student_name.ilike.%${q}%`);
  }
  return query;
}

export async function getStudentActions(filters: StudentActionFilters = {}): Promise<StudentActionRecord[]> {
  let query = supabase
    .from("student_actions")
    .select(SELECT_WITH_JOINS)
    .order("created_at", { ascending: false })
    .limit(200);

  query = applyFilters(query, filters);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toStudentActionRecord);
}

/** Real (range-based) pagination for the on-page action log: fetches only one
 * page of rows at a time plus an exact total count, instead of pulling every
 * matching record into the browser. */
export async function getStudentActionsPage(
  filters: StudentActionFilters = {},
  page = 1,
  pageSize = 10
): Promise<StudentActionsPageResult> {
  let query = supabase
    .from("student_actions")
    .select(SELECT_WITH_JOINS, { count: "exact" })
    .order("created_at", { ascending: false });

  query = applyFilters(query, filters);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return { rows: (data ?? []).map(toStudentActionRecord), total: count ?? 0 };
}

/** True if a pending request already exists for the same student, action
 * type, date, and lesson — used to block a duplicate submission client-side
 * before it even reaches the database. */
export async function hasPendingDuplicate(params: {
  studentId: string;
  type: StudentActionType;
  actionDate: string;
  lesson: string;
  excludeId?: string;
}): Promise<boolean> {
  let query = supabase
    .from("student_actions")
    .select("id", { count: "exact", head: true })
    .eq("student_id", params.studentId)
    .eq("type", params.type)
    .eq("action_date", params.actionDate)
    .eq("lesson", params.lesson)
    .eq("status", "pending");

  if (params.excludeId) query = query.neq("id", params.excludeId);

  const { count, error } = await query;
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function getStudentActionById(id: string): Promise<StudentActionRecord | null> {
  const { data, error } = await supabase
    .from("student_actions")
    .select(SELECT_WITH_JOINS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toStudentActionRecord(data) : null;
}

const DUPLICATE_PENDING_MESSAGE = "يوجد طلب مماثل قيد الانتظار لنفس الطالب ونفس نوع الإجراء ونفس التاريخ والحصة.";

export async function createStudentAction(input: CreateStudentActionInput): Promise<StudentActionRecord> {
  const { data, error } = await supabase
    .from("student_actions")
    .insert({
      student_id: input.studentId,
      student_name: input.studentName,
      grade: input.grade,
      section: input.section,
      type: input.type,
      reason: input.reason,
      lesson: input.lesson,
      notes: input.notes?.trim() || null,
      action_date: input.actionDate,
      action_time: input.actionTime,
      requested_by: input.requestedBy,
      assigned_teacher_id: input.assignedTeacherId,
      status: "pending",
    })
    .select(SELECT_WITH_JOINS)
    .single();
  if (error) {
    if (error.code === "23505") throw new Error(DUPLICATE_PENDING_MESSAGE);
    throw error;
  }
  if (!data) throw new Error("تعذر حفظ الإجراء في قاعدة البيانات.");
  return toStudentActionRecord(data);
}

/** Marks a pending action as completed. Atomic: only succeeds if the row was still
 * "pending" at write time, so a duplicate click (or two staff acting at once) can't
 * process the same action twice. Returns null if it was already handled. */
export async function completeStudentAction(id: string, completedBy: string): Promise<StudentActionRecord | null> {
  const { data, error } = await supabase
    .from("student_actions")
    .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: completedBy })
    .eq("id", id)
    .eq("status", "pending")
    .select(SELECT_WITH_JOINS)
    .maybeSingle();
  if (error) throw error;
  return data ? toStudentActionRecord(data) : null;
}

/** Marks a pending action as postponed. Same atomic guard as completeStudentAction. */
export async function postponeStudentAction(
  id: string,
  postponedBy: string,
  postponedUntil: string
): Promise<StudentActionRecord | null> {
  const { data, error } = await supabase
    .from("student_actions")
    .update({ status: "postponed", postponed_until: postponedUntil, completed_by: postponedBy })
    .eq("id", id)
    .eq("status", "pending")
    .select(SELECT_WITH_JOINS)
    .maybeSingle();
  if (error) throw error;
  return data ? toStudentActionRecord(data) : null;
}

export async function cancelStudentAction(id: string): Promise<StudentActionRecord | null> {
  const { data, error } = await supabase
    .from("student_actions")
    .update({ status: "cancelled" })
    .eq("id", id)
    .neq("status", "completed")
    .select(SELECT_WITH_JOINS)
    .maybeSingle();
  if (error) throw error;
  return data ? toStudentActionRecord(data) : null;
}

/** Admin-only edit of a request before it's been acted on. */
export async function updateStudentAction(id: string, patch: UpdateStudentActionInput): Promise<StudentActionRecord | null> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.type !== undefined) dbPatch.type = patch.type;
  if (patch.reason !== undefined) dbPatch.reason = patch.reason;
  if (patch.lesson !== undefined) dbPatch.lesson = patch.lesson;
  if (patch.notes !== undefined) dbPatch.notes = patch.notes.trim() || null;
  if (patch.actionDate !== undefined) dbPatch.action_date = patch.actionDate;
  if (patch.actionTime !== undefined) dbPatch.action_time = patch.actionTime;
  if (patch.assignedTeacherId !== undefined) dbPatch.assigned_teacher_id = patch.assignedTeacherId;

  const { data, error } = await supabase
    .from("student_actions")
    .update(dbPatch)
    .eq("id", id)
    .eq("status", "pending")
    .select(SELECT_WITH_JOINS)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") throw new Error(DUPLICATE_PENDING_MESSAGE);
    throw error;
  }
  return data ? toStudentActionRecord(data) : null;
}

/** Re-sends the notification to the assigned teacher for a still-pending action. */
export async function resendStudentAction(id: string): Promise<StudentActionRecord | null> {
  const action = await getStudentActionById(id);
  if (!action || action.status !== "pending") return null;
  return action;
}
