import { supabase } from "@/lib/supabase";

export type ExcuseRecord = {
  id: string;
  studentId: string;
  studentName: string;
  reason: string;
  date: string;
  status: "pending" | "approved";
};

function toExcuseRecord(row: any): ExcuseRecord {
  return {
    id: String(row.id),
    studentId: row.student_id ?? row.studentId ?? "",
    studentName: row.student_name ?? row.studentName ?? "",
    reason: row.reason ?? "",
    date: row.date ?? "",
    status: row.status ?? "pending",
  };
}

export async function getExcuses(): Promise<ExcuseRecord[]> {
  const { data, error } = await supabase.from("excuses").select("*").order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toExcuseRecord);
}

export async function saveExcuses(records: ExcuseRecord[]) {
  const rows = records.map((record) => ({
    id: record.id,
    student_id: record.studentId,
    student_name: record.studentName,
    reason: record.reason,
    date: record.date,
    status: record.status,
  }));
  if (!rows.length) return;
  const { error } = await supabase.from("excuses").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

export async function addExcuse(record: ExcuseRecord) {
  const { error } = await supabase.from("excuses").insert({
    id: record.id,
    student_id: record.studentId,
    student_name: record.studentName,
    reason: record.reason,
    date: record.date,
    status: record.status,
  });
  if (error) throw error;
}
