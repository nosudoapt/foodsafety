// Offline outbox — Phase 5 PWA offline sync.
//
// A write that fails while the tablet has no signal is parked in IndexedDB and
// replayed on the next page load or when the browser fires "online". The store
// is injected so node:test can exercise every path without a browser; the
// default store falls back to memory where indexedDB doesn't exist (tests/SSR).

export type OfflineKind = "prep_save" | "temp_record";

export interface OfflineOp {
  id: string;
  kind: OfflineKind;
  /** ISO timestamp — replay is oldest-first. */
  created_at: string;
  /** Failed attempts so far; exhausted operations remain as recoverable evidence. */
  attempts: number;
  /** Missing on legacy captures, which are treated as pending. */
  state?: "pending" | "dead_letter";
  failure_reason?: "queue_overflow" | "send_failed";
  /** Human label for the sync banner ("Prep sheet · 2026-10-04"). */
  label: string;
  payload: unknown;
}

export interface QueueStore {
  read(): Promise<OfflineOp[]>;
  write(ops: OfflineOp[]): Promise<void>;
  /** The read/modify/write must be one storage transaction across tabs. */
  mutate?(change: (ops: OfflineOp[]) => OfflineOp[]): Promise<OfflineOp[]>;
  /** Drain coordination is separate so enqueue inside a sender cannot deadlock. */
  exclusive?<T>(work: () => Promise<T>): Promise<T>;
}

export interface DrainResult {
  sent: number;
  failed: number;
  /** Compatibility counter: captured evidence is never automatically dropped. */
  dropped: number;
  remaining: number;
}

/** Rows the prep sheet parks for a later replay (same shape as the insert). */
export interface PrepSaveRow {
  item_name: string;
  par: number;
  on_hand: number;
  pull: number;
  urgent: boolean;
  count_date: string;
  location_id: string | null;
}

export interface PrepSavePayload {
  date: string;
  /** locationScope() captured at save time — the replay delete must match. */
  scope: string | null;
  rows: PrepSaveRow[];
}

/** The temperature insert, with recorded_at frozen so an offline entry keeps its real time. */
export interface TempRecordPayload {
  user_id: string;
  restaurant_name: string;
  location_id: string | null;
  equipment_name: string;
  record_type: string;
  food_item: string;
  temperature: number;
  min_safe_temp: number;
  max_safe_temp: number;
  is_safe: boolean;
  notes: string;
  recorded_at: string;
}

/** Automatic-work threshold, not a destructive storage cap. */
export const QUEUE_LIMIT = 50;
export const MAX_ATTEMPTS = 5;

// Anything that reads like a missing table/column/policy is a migration the
// user must run by hand — queueing would just retry the same doomed write.
// Everything else (failed to fetch, network error, no message at all) is
// treated as connectivity and parked for replay.
const SCHEMA_ERROR =
  /does not exist|relation |column |schema |permission denied|row-level security|violates|duplicate key|invalid input|not a valid/i;

export function shouldQueue(message?: string | null): boolean {
  if (!message) return true;
  return !SCHEMA_ERROR.test(message);
}

const newId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function newOp(kind: OfflineKind, label: string, payload: unknown, now = new Date()): OfflineOp {
  return {
    id: newId(),
    kind,
    created_at: now.toISOString(),
    attempts: 0,
    label,
    payload,
  };
}

const locks = new WeakMap<QueueStore, Map<string, Promise<unknown>>>();
function serialized<T>(store: QueueStore, name: string, work: () => Promise<T>): Promise<T> {
  let state = locks.get(store);
  if (!state) { state = new Map(); locks.set(store, state); }
  const previous = state.get(name) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  state.set(name, next);
  void next.finally(() => { if (state!.get(name) === next) state!.delete(name); }).catch(() => {});
  return next;
}
function mutate(store: QueueStore, change: (ops: OfflineOp[]) => OfflineOp[]): Promise<OfflineOp[]> {
  if (store.mutate) return store.mutate(change);
  return serialized(store, "mutation", async () => {
    const next = change(await store.read()); await store.write(next); return next;
  });
}

/** Preserve every capture. Overflow is retained visibly for manual retry/export. */
export async function enqueue(store: QueueStore, op: OfflineOp): Promise<OfflineOp[]> {
  return mutate(store, (ops) => {
    if (ops.some((item) => item.id === op.id)) return ops;
    const overflow = ops.filter((item) => item.state !== "dead_letter").length >= QUEUE_LIMIT;
    return [{ ...op, state: overflow ? "dead_letter" as const : "pending" as const,
      ...(overflow ? { failure_reason: "queue_overflow" as const } : {}) }, ...ops];
  });
}

/**
 * Replay queued ops oldest-first. `kinds` limits a page to its own ops (the
 * prep sheet must not consume temperature records). A failing send keeps the
 * op for the next drain. Exhausted operations stop automatic retries but remain
 * visible and exportable until the user explicitly retries them.
 */
export async function drain(
  store: QueueStore,
  send: (op: OfflineOp) => Promise<void>,
  kinds?: readonly OfflineKind[],
): Promise<DrainResult> {
  const work = async () => {
    const targeted = (await store.read()).filter((o) => o.state !== "dead_letter" && (!kinds || kinds.includes(o.kind)))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    let sent = 0, failed = 0;
    for (const op of targeted) {
      let accepted = false;
      try { await send(op); accepted = true; } catch { /* Retain the exact capture. */ }
      // Persist each acknowledgement separately. Never replace a stale full
      // snapshot: captures enqueued while the HTTP request was in flight survive.
      await mutate(store, (ops) => accepted ? ops.filter((item) => item.id !== op.id) : ops.map((item) => {
        if (item.id !== op.id) return item;
        const attempts = item.attempts + 1;
        return { ...item, attempts, ...(attempts >= MAX_ATTEMPTS
          ? { state: "dead_letter" as const, failure_reason: "send_failed" as const } : {}) };
      }));
      if (accepted) sent++; else failed++;
    }
    return { sent, failed, dropped: 0, remaining: (await store.read()).length };
  };
  return store.exclusive ? store.exclusive(work) : serialized(store, "drain", work);
}

/** A user recovery action; neither payload nor stable operation ID is changed. */
export async function retryDeadLetters(store: QueueStore, kinds?: readonly OfflineKind[]): Promise<void> {
  await mutate(store, (ops) => ops.map((op) => {
    if (op.state !== "dead_letter" || (kinds && !kinds.includes(op.kind))) return op;
    const { failure_reason: _reason, ...retained } = op;
    return { ...retained, state: "pending", attempts: 0 };
  }));
}

export async function pendingCount(store: QueueStore, kinds?: readonly OfflineKind[]): Promise<number> {
  const ops = await store.read();
  return kinds ? ops.filter((o) => kinds.includes(o.kind)).length : ops.length;
}

/** In-memory store — tests, and the SSR/Node fallback for defaultStore(). */
export function memoryStore(seed: OfflineOp[] = []): QueueStore {
  let ops = seed.slice();
  return {
    async read() {
      return ops.slice();
    },
    async write(next) {
      ops = next.slice();
    },
  };
}

const DB_NAME = "foodsafe-offline";
const STORE_NAME = "ops";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** IndexedDB-backed store — survives reloads and runs while the site is offline. */
export function idbStore(): QueueStore {
  return {
    async exclusive(work) {
      // Web Locks release on page/process loss and coordinate distinct tabs.
      // Without that primitive, retain/export rather than risk double delivery.
      if (typeof navigator === "undefined" || !navigator.locks) throw new Error("Coordinated offline sync is unavailable in this browser. Retained records can be exported.");
      return navigator.locks.request(`${DB_NAME}:drain`, { mode: "exclusive" }, work);
    },
    async read() {
      const db = await openDb();
      try {
        return await new Promise<OfflineOp[]>((resolve, reject) => {
          const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
          req.onsuccess = () => resolve((req.result ?? []) as OfflineOp[]);
          req.onerror = () => reject(req.error);
        });
      } finally {
        db.close();
      }
    },
    async write(next) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        for (const op of next) store.put(op);
        await done(tx);
      } finally {
        db.close();
      }
    },
    async mutate(change) {
      const db = await openDb();
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const complete = done(tx);
        const store = tx.objectStore(STORE_NAME);
        let next: OfflineOp[] = [];
        let failure: unknown;
        const request = store.getAll();
        request.onsuccess = () => {
          try {
            next = change(request.result as OfflineOp[]);
            store.clear(); for (const op of next) store.put(op);
          } catch (error) { failure = error; tx.abort(); }
        };
        try { await complete; } catch (error) { throw failure ?? error; }
        return next;
      } finally { db.close(); }
    },
  };
}

export function defaultStore(): QueueStore {
  if (typeof indexedDB === "undefined") return memoryStore();
  return idbStore();
}
