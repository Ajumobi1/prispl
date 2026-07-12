import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type VaultNote = Tables<"vault_notes">;
export type VaultRecord = Tables<"vault_records">;
export type VaultFile = Tables<"vault_files">;

// ---------- Notes ----------
export async function listNotes(): Promise<VaultNote[]> {
  const { data, error } = await supabase
    .from("vault_notes")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createNote(input: { title: string; content: string; tags: string[] }): Promise<VaultNote> {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from("vault_notes")
    .insert({ ...input, created_by: session?.user?.id ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateNote(id: string, input: { title: string; content: string; tags: string[] }): Promise<VaultNote> {
  const { data, error } = await supabase.from("vault_notes").update(input).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from("vault_notes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- Records ----------
export async function listRecords(collection?: string): Promise<VaultRecord[]> {
  let q = supabase.from("vault_records").select("*").order("updated_at", { ascending: false });
  if (collection) q = q.eq("collection", collection);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listCollections(): Promise<string[]> {
  const { data, error } = await supabase.from("vault_records").select("collection");
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((r) => r.collection))).sort();
}

export async function createRecord(input: { collection: string; title: string; data: Record<string, unknown> }): Promise<VaultRecord> {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from("vault_records")
    .insert({
      collection: input.collection,
      title: input.title,
      data: input.data as never,
      created_by: session?.user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateRecord(id: string, input: { collection: string; title: string; data: Record<string, unknown> }): Promise<VaultRecord> {
  const { data, error } = await supabase
    .from("vault_records")
    .update({ collection: input.collection, title: input.title, data: input.data as never })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRecord(id: string): Promise<void> {
  const { error } = await supabase.from("vault_records").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- Files ----------
export async function listFiles(): Promise<VaultFile[]> {
  const { data, error } = await supabase
    .from("vault_files")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function uploadFile(file: File, folder: string, description: string): Promise<VaultFile> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  const cleanFolder = folder.trim().replace(/^\/+|\/+$/g, "");
  const path = `${uid ?? "anon"}/${cleanFolder ? cleanFolder + "/" : ""}${Date.now()}-${file.name}`;
  const { error: upErr } = await supabase.storage.from("vault-files").upload(path, file);
  if (upErr) throw new Error(upErr.message);
  const { data, error } = await supabase
    .from("vault_files")
    .insert({
      folder: cleanFolder,
      file_name: file.name,
      file_path: path,
      content_type: file.type || "application/octet-stream",
      file_size: file.size,
      description,
      uploaded_by: uid ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function downloadFile(row: VaultFile): Promise<void> {
  const { data, error } = await supabase.storage.from("vault-files").download(row.file_path);
  if (error) throw new Error(error.message);
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = row.file_name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function deleteFile(row: VaultFile): Promise<void> {
  await supabase.storage.from("vault-files").remove([row.file_path]);
  const { error } = await supabase.from("vault_files").delete().eq("id", row.id);
  if (error) throw new Error(error.message);
}
