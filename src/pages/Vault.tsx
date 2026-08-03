import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  createNote, createRecord, deleteFile, deleteNote, deleteRecord,
  downloadFile, listCollections, listFiles, listNotes, listRecords,
  updateNote, updateRecord, uploadFile,
  type VaultFile, type VaultNote, type VaultRecord,
} from "@/lib/vaultApi";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Download, FileText, FolderOpen, NotebookPen, Plus, Trash2, Upload, Database, Pencil, Search, type LucideIcon } from "lucide-react";
import SEO from "@/components/SEO";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-10 text-center">
      <Icon className="mb-3 h-8 w-8 text-muted-foreground" />
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}


export default function VaultPage() {
  return (
    <div className="min-h-screen bg-background">
      <SEO title="Data Vault — PR&S Unit" description="Shared files, notes, and records for the PR&S Unit." />
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Database className="h-6 w-6" />
            <div>
              <h1 className="text-lg font-bold">Data Vault</h1>
              <p className="text-xs text-primary-foreground/80">Shared storage for the PR&amp;S Unit</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" asChild><Link to="/task-tracker">Tasks</Link></Button>
            <Button variant="secondary" size="sm" asChild><Link to="/dashboard">Dashboard</Link></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4">
        <Tabs defaultValue="files">
          <TabsList>
            <TabsTrigger value="files"><FolderOpen className="mr-2 h-4 w-4" />Files</TabsTrigger>
            <TabsTrigger value="notes"><NotebookPen className="mr-2 h-4 w-4" />Notes</TabsTrigger>
            <TabsTrigger value="records"><FileText className="mr-2 h-4 w-4" />Records</TabsTrigger>
          </TabsList>
          <TabsContent value="files"><FilesTab /></TabsContent>
          <TabsContent value="notes"><NotesTab /></TabsContent>
          <TabsContent value="records"><RecordsTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ---------------- Files ----------------
function FilesTab() {
  const { session } = useAuth();
  const [rows, setRows] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [folder, setFolder] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [filterFolder, setFilterFolder] = useState("");
  const [query, setQuery] = useState("");

  async function refresh() {
    setLoading(true);
    try { setRows(await listFiles()); } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  const folders = useMemo(() => Array.from(new Set(rows.map(r => r.folder).filter(Boolean))).sort(), [rows]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterFolder && r.folder !== filterFolder) return false;
      if (!q) return true;
      return `${r.file_name} ${r.description} ${r.folder}`.toLowerCase().includes(q);
    });
  }, [rows, filterFolder, query]);


  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      await uploadFile(file, folder, description);
      toast.success("Uploaded");
      setFile(null); setFolder(""); setDescription("");
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); }
  }

  const canDelete = (r: VaultFile) => r.uploaded_by === session?.id || session?.role === "admin";

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Files</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>File</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <Label>Folder (optional)</Label>
            <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="e.g. reports" />
          </div>
          <div className="flex items-end">
            <Button onClick={handleUpload} disabled={!file || uploading} className="w-full">
              <Upload className="mr-2 h-4 w-4" />{uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
          <div className="sm:col-span-4">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this file?" />
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files by name, folder or description" />
        </div>

        {folders.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Folders:</span>
            <Badge variant={!filterFolder ? "default" : "outline"} onClick={() => setFilterFolder("")} className="cursor-pointer">All</Badge>
            {folders.map(f => (
              <Badge key={f} variant={filterFolder === f ? "default" : "outline"} onClick={() => setFilterFolder(f)} className="cursor-pointer">{f}</Badge>
            ))}
          </div>
        )}

        {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : visible.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title={rows.length === 0 ? "No files yet" : "No matching files"}
            hint={rows.length === 0 ? "Upload your first document above — add a folder name to keep things organised." : "Try a different search term or clear the folder filter."}
          />
        ) : (

          <div className="divide-y rounded-md border">
            {visible.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.file_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.folder && <span className="mr-2">📁 {r.folder}</span>}
                    {formatBytes(Number(r.file_size))} · {fmtDate(r.created_at)}
                  </div>
                  {r.description && <div className="mt-1 text-xs text-muted-foreground">{r.description}</div>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => downloadFile(r).catch(e => toast.error((e as Error).message))}>
                  <Download className="h-4 w-4" />
                </Button>
                {canDelete(r) && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete file?</AlertDialogTitle>
                        <AlertDialogDescription>This permanently removes {r.file_name}.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={async () => {
                          try { await deleteFile(r); toast.success("Deleted"); await refresh(); }
                          catch (e) { toast.error((e as Error).message); }
                        }}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------- Notes ----------------
function NotesTab() {
  const { session } = useAuth();
  const [rows, setRows] = useState<VaultNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<VaultNote | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsText, setTagsText] = useState("");

  async function refresh() {
    setLoading(true);
    try { setRows(await listNotes()); } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  function openNew() { setEditing(null); setTitle(""); setContent(""); setTagsText(""); setOpen(true); }
  function openEdit(n: VaultNote) { setEditing(n); setTitle(n.title); setContent(n.content); setTagsText(n.tags.join(", ")); setOpen(true); }

  async function save() {
    const tags = tagsText.split(",").map(t => t.trim()).filter(Boolean);
    try {
      if (editing) { await updateNote(editing.id, { title, content, tags }); toast.success("Updated"); }
      else { await createNote({ title, content, tags }); toast.success("Created"); }
      setOpen(false); await refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  const canEdit = (n: VaultNote) => n.created_by === session?.id || session?.role === "admin";

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Notes</CardTitle>
        <Button size="sm" onClick={openNew}><Plus className="mr-2 h-4 w-4" />New note</Button>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((n) => (
              <Card key={n.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{n.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground line-clamp-6">{n.content}</p>
                  {n.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {n.tags.map(t => <Badge key={t} variant="secondary">{t}</Badge>)}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">{fmtDate(n.updated_at)}</div>
                  {canEdit(n) && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(n)}><Pencil className="mr-1 h-3 w-3" />Edit</Button>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (!confirm("Delete this note?")) return;
                        try { await deleteNote(n.id); toast.success("Deleted"); await refresh(); }
                        catch (e) { toast.error((e as Error).message); }
                      }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit note" : "New note"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div><Label>Content</Label><Textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} /></div>
            <div><Label>Tags (comma-separated)</Label><Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!title.trim()}>{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------------- Records ----------------
function RecordsTab() {
  const { session } = useAuth();
  const [rows, setRows] = useState<VaultRecord[]>([]);
  const [collections, setCollections] = useState<string[]>([]);
  const [activeCollection, setActiveCollection] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VaultRecord | null>(null);
  const [collection, setCollection] = useState("");
  const [title, setTitle] = useState("");
  const [fields, setFields] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);

  async function refresh() {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([listRecords(activeCollection || undefined), listCollections()]);
      setRows(r); setCollections(c);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, [activeCollection]);

  function openNew() {
    setEditing(null); setCollection(activeCollection || ""); setTitle("");
    setFields([{ key: "", value: "" }]); setOpen(true);
  }
  function openEdit(r: VaultRecord) {
    setEditing(r); setCollection(r.collection); setTitle(r.title);
    const entries = Object.entries((r.data as Record<string, unknown>) ?? {});
    setFields(entries.length ? entries.map(([k, v]) => ({ key: k, value: String(v ?? "") })) : [{ key: "", value: "" }]);
    setOpen(true);
  }

  async function save() {
    const data: Record<string, unknown> = {};
    fields.forEach(f => { if (f.key.trim()) data[f.key.trim()] = f.value; });
    try {
      if (editing) { await updateRecord(editing.id, { collection, title, data }); toast.success("Updated"); }
      else { await createRecord({ collection, title, data }); toast.success("Created"); }
      setOpen(false); await refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  const canEdit = (r: VaultRecord) => r.created_by === session?.id || session?.role === "admin";

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Records</CardTitle>
        <Button size="sm" onClick={openNew}><Plus className="mr-2 h-4 w-4" />New record</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Collections:</span>
          <Badge variant={!activeCollection ? "default" : "outline"} onClick={() => setActiveCollection("")} className="cursor-pointer">All</Badge>
          {collections.map(c => (
            <Badge key={c} variant={activeCollection === c ? "default" : "outline"} onClick={() => setActiveCollection(c)} className="cursor-pointer">{c}</Badge>
          ))}
        </div>

        {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No records yet. Create your first entry — set a collection name like "contacts" or "assets" to group them.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {rows.map((r) => {
              const entries = Object.entries((r.data as Record<string, unknown>) ?? {});
              return (
                <div key={r.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{r.title}</div>
                      <div className="text-xs text-muted-foreground">{r.collection} · {fmtDate(r.updated_at)}</div>
                    </div>
                    {canEdit(r) && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={async () => {
                          if (!confirm("Delete this record?")) return;
                          try { await deleteRecord(r.id); toast.success("Deleted"); await refresh(); }
                          catch (e) { toast.error((e as Error).message); }
                        }}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </div>
                    )}
                  </div>
                  {entries.length > 0 && (
                    <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                      {entries.map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="font-medium text-muted-foreground">{k}:</dt>
                          <dd className="min-w-0 flex-1 break-words">{String(v ?? "")}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit record" : "New record"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Collection</Label><Input value={collection} onChange={(e) => setCollection(e.target.value)} placeholder="e.g. contacts, assets" /></div>
            <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div>
              <Label>Fields</Label>
              <div className="space-y-2">
                {fields.map((f, i) => (
                  <div key={i} className="flex gap-2">
                    <Input placeholder="Field name" value={f.key} onChange={(e) => setFields(fields.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
                    <Input placeholder="Value" value={f.value} onChange={(e) => setFields(fields.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                    <Button variant="ghost" size="sm" onClick={() => setFields(fields.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setFields([...fields, { key: "", value: "" }])}><Plus className="mr-1 h-3 w-3" />Add field</Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!collection.trim() || !title.trim()}>{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
