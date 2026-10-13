"use client";

/**
 * Minimal promise wrapper around IndexedDB (no dependency).
 * The SAME name/version/stores are declared in public/sw.js — keep them in sync.
 *
 *  enrollments  keyPath "id",       index "cardCode"  ← offline snapshot
 *  queue        keyPath "clientId", index "scannedAt" ← scans waiting to sync
 *  meta         keyPath "key"                         ← snapshot meta, rejected log…
 */
export const DB_NAME = "nokhba-offline";
export const DB_VERSION = 1;

export type StoreName = "enrollments" | "queue" | "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("enrollments")) {
        db.createObjectStore("enrollments", { keyPath: "id" }).createIndex("cardCode", "cardCode", { unique: false });
      }
      if (!db.objectStoreNames.contains("queue")) {
        db.createObjectStore("queue", { keyPath: "clientId" }).createIndex("scannedAt", "scannedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
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

export async function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).getAll()) as Promise<T[]>;
}

export async function idbGetByIndex<T>(store: StoreName, index: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).index(index).get(key)) as Promise<T | undefined>;
}

export async function idbCount(store: StoreName): Promise<number> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).count());
}

export async function idbPut<T>(store: StoreName, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  return done(tx);
}

export async function idbDelete(store: StoreName, keys: IDBValidKey[]): Promise<void> {
  if (!keys.length) return;
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  keys.forEach((k) => os.delete(k));
  return done(tx);
}

/** Atomically replaces the whole store content (snapshot refresh). */
export async function idbReplaceAll<T>(store: StoreName, values: T[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  os.clear();
  values.forEach((v) => os.put(v));
  return done(tx);
}

/** Oldest-first slice of the queue. */
export async function idbQueueBatch<T>(limit: number): Promise<T[]> {
  const db = await openDb();
  const index = db.transaction("queue").objectStore("queue").index("scannedAt");
  return new Promise((resolve, reject) => {
    const out: T[] = [];
    const req = index.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || out.length >= limit) return resolve(out);
      out.push(cursor.value as T);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}
