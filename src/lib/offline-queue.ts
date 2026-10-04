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
  /** Failed attempts so far; an op that keeps failing is dropped, not parked forever. */
  attempts: number;
  /** Human label for the sync banner ("Prep sheet · 2026-10-04"). */
  label: string;
  payload: unknown;
}

export interface QueueStore {
  read(): Promise<OfflineOp[]>;
  write(ops: OfflineOp[]): Promise<void>;
}

export interface DrainResult {
  sent: number;
  failed: number;
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

/** Park an op at the front of the queue, trimming the oldest beyond the cap. */
export async function enqueue(store: QueueStore, op: OfflineOp): Promise<OfflineOp[]> {
  const ops = await store.read();
  const next = [op, ...ops].slice(0, QUEUE_LIMIT);
  await store.write(next);
  return next;
}

/**
 * Replay queued ops oldest-first. `kinds` limits a page to its own ops (the
 * prep sheet must not consume temperature records). A failing send keeps the
 * op for the next drain unless it has burned through MAX_ATTEMPTS.
 */
export async function drain(
  store: QueueStore,
  send: (op: OfflineOp) => Promise<void>,
  kinds?: readonly OfflineKind[],
): Promise<DrainResult> {
  const ops = await store.read();
  const targeted = (kinds ? ops.filter((o) => kinds.includes(o.kind)) : ops)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const targetIds = new Set(targeted.map((o) => o.id));

  const kept: OfflineOp[] = [];
  let sent = 0;
  let failed = 0;
  let dropped = 0;
  for (const op of targeted) {
    try {
      await send(op);
      sent += 1;
    } catch {
      const attempts = op.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) dropped += 1;
      else {
        kept.push({ ...op, attempts });
        failed += 1;
      }
    }
  }

  const next = [...ops.filter((o) => !targetIds.has(o.id)), ...kept].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
  await store.write(next);
  return { sent, failed, dropped, remaining: next.length };
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
  };
}

export function defaultStore(): QueueStore {
  if (typeof indexedDB === "undefined") return memoryStore();
  return idbStore();
}
