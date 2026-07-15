import { supabase } from "@/lib/supabase";

export type Subject = { id: string; name: string };
export type Section = { id: string; name: string; sortOrder: number };

export async function getSubjects(): Promise<Subject[]> {
  const { data, error } = await supabase.from("subjects").select("id, name").order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name ?? "") }));
}

export async function createSubject(name: string): Promise<Subject> {
  const { data, error } = await supabase.from("subjects").insert({ name }).select("id, name").single();
  if (error) throw error;
  return { id: String(data.id), name: String(data.name ?? name) };
}

export async function updateSubject(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("subjects").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteSubject(id: string): Promise<void> {
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  if (error) throw error;
}

export async function getSections(): Promise<Section[]> {
  const { data, error } = await supabase.from("sections").select("id, name, sort_order").order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name ?? ""), sortOrder: Number(row.sort_order) }));
}

export async function createSection(name: string): Promise<Section> {
  const existing = await getSections();
  const nextSortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;

  const { data, error } = await supabase
    .from("sections")
    .insert({ name, sort_order: nextSortOrder })
    .select("id, name, sort_order")
    .single();

  if (error) throw error;
  return { id: String(data.id), name: String(data.name ?? name), sortOrder: Number(data.sort_order) };
}

export async function updateSection(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("sections").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteSection(id: string): Promise<void> {
  const { error } = await supabase.from("sections").delete().eq("id", id);
  if (error) throw error;
}

export async function addGradeLevel(stageId: string, name: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("grade_levels")
    .select("sort_order")
    .eq("stage_id", stageId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (fetchError) throw fetchError;

  const nextSortOrder = (existing?.[0]?.sort_order ?? 0) + 1;

  const { error } = await supabase.from("grade_levels").insert({ stage_id: stageId, name, sort_order: nextSortOrder });
  if (error) throw error;
}

export async function deleteGradeLevel(id: string): Promise<void> {
  const { error } = await supabase.from("grade_levels").delete().eq("id", id);
  if (error) throw error;
}
