import type { CreateTaskPayload } from "./api";

// Lightweight IndexedDB-backed outbox for create-task payloads made while offline.
// Kept intentionally tiny — no external deps.

const DB_NAME = "prs-offline-outbox";
const DB_VERSION = 1;
const STORE = "createTaskQueue";

export interface QueuedCreateTask {
  id: string;              // client-generated id
  payload: CreateTaskPayload;
  queuedAt: string;        // ISO timestamp
  attempts: number;
  lastError?: string;
}

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

function notify(count: number) {
  for (const l of listeners) {
    try { l(count); } catch { /* ignore */ }
  }
}

export function subscribeOutbox(cb: Listener): () => void {
  listeners.add(cb);
  // Fire initial value
  getOutboxCount().then(cb).catch(() => cb(0));
  return () => { listeners.delete(cb); };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result: T;
    Promise.resolve(fn(store))
      .then((r) => { result = r; })
      .catch(reject);
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

function makeId(): string {
  return `off-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function queueCreateTask(payload: CreateTaskPayload): Promise<QueuedCreateTask> {
  const entry: QueuedCreateTask = {
    id: makeId(),
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  await withStore("readwrite", (store) => {
    store.put(entry);
  });
  notify(await getOutboxCount());
  return entry;
}

export async function listQueued(): Promise<QueuedCreateTask[]> {
  try {
    return await withStore("readonly", (store) => new Promise<QueuedCreateTask[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result ?? []) as QueuedCreateTask[]);
      req.onerror = () => reject(req.error);
    }));
  } catch {
    return [];
  }
}

export async function getOutboxCount(): Promise<number> {
  try {
    return await withStore("readonly", (store) => new Promise<number>((resolve, reject) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  } catch {
    return 0;
  }
}

async function removeQueued(id: string): Promise<void> {
  await withStore("readwrite", (store) => { store.delete(id); });
  notify(await getOutboxCount());
}

async function updateQueued(entry: QueuedCreateTask): Promise<void> {
  await withStore("readwrite", (store) => { store.put(entry); });
  notify(await getOutboxCount());
}

let draining = false;

/**
 * Attempt to replay every queued create-task against Supabase.
 * Uses a dynamic import to avoid a circular dep with api.ts.
 */
export async function drainOutbox(): Promise<{ succeeded: number; failed: number }> {
  if (draining) return { succeeded: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { succeeded: 0, failed: 0 };
  draining = true;
  let succeeded = 0;
  let failed = 0;
  try {
    const queued = await listQueued();
    if (queued.length === 0) return { succeeded, failed };
    const { createTaskDirect } = await import("./api");
    for (const entry of queued) {
      try {
        await createTaskDirect(entry.payload);
        await removeQueued(entry.id);
        succeeded++;
      } catch (err) {
        failed++;
        await updateQueued({
          ...entry,
          attempts: entry.attempts + 1,
          lastError: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    draining = false;
  }
  return { succeeded, failed };
}
