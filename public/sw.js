/* Al Nokhba — service worker
 *
 * 1. App shell offline: pages are network-first (fallback to cache), Next.js
 *    static assets are cache-first (they are content-hashed/immutable).
 * 2. /api/* is never cached — offline decisions come from IndexedDB instead.
 * 3. Background Sync ("nokhba-sync"): pushes the IndexedDB queue to
 *    /api/attendance/sync even if every tab of the app was closed.
 *    The page-side engine (src/lib/offline/sync.ts) does the same while open;
 *    the server is idempotent, so both running at once is harmless.
 */
const VERSION = "v3";
const SHELL_CACHE = `nokhba-shell-${VERSION}`;
const ASSET_CACHE = `nokhba-assets-${VERSION}`;
const SHELL_PAGES = ["/", "/scan", "/students", "/groups", "/payments", "/reports", "/settings"];
const SHELL_FILES = ["/manifest.webmanifest", "/icon.svg"];

// Must match src/lib/offline/db.ts
const DB_NAME = "nokhba-offline";
const DB_VERSION = 1;
const SYNC_TAG = "nokhba-sync";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, so one failing page doesn't abort the install
      await Promise.all([...SHELL_PAGES, ...SHELL_FILES].map((u) => cache.add(u).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // always network
  if (req.headers.get("RSC")) return; // Next.js client navigations: on failure Next falls back to a full page load

  // Immutable build assets & fonts → cache-first
  if (url.pathname.startsWith("/_next/static/") || SHELL_FILES.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) (await caches.open(ASSET_CACHE)).put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  // Pages → network-first (3.5s) then cached copy, then the scanner page
  if (req.mode === "navigate") {
    // The network request keeps running even if we answer from cache after the
    // timeout, so a slow-but-alive server still refreshes the cached page.
    const network = fetch(req).then(async (res) => {
      // Redirected responses can't be replayed for navigations — don't cache them
      if (res.ok && !res.redirected) await (await caches.open(SHELL_CACHE)).put(url.pathname, res.clone());
      return res;
    });
    event.waitUntil(network.catch(() => {}));
    event.respondWith(
      (async () => {
        try {
          return await Promise.race([network, timeout(3500)]);
        } catch {
          return (
            (await caches.match(url.pathname, { ignoreSearch: true })) ||
            (await caches.match("/scan")) ||
            new Response("<h1 dir=rtl>غير متصل</h1>", { headers: { "Content-Type": "text/html; charset=utf-8" } })
          );
        }
      })(),
    );
  }
});

// The page sends the asset URLs it actually loaded so the shell works offline on the next visit
self.addEventListener("message", (event) => {
  if (event.data?.type === "nokhba-cache-urls" && Array.isArray(event.data.urls)) {
    event.waitUntil(
      caches.open(ASSET_CACHE).then((cache) =>
        Promise.all(
          event.data.urls.map(async (u) => {
            if (!(await cache.match(u))) await cache.add(u).catch(() => {});
          }),
        ),
      ),
    );
  }
});

/* ───────────── Background Sync ───────────── */

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(flushQueue());
});

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("enrollments")) db.createObjectStore("enrollments", { keyPath: "id" }).createIndex("cardCode", "cardCode", { unique: false });
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "clientId" }).createIndex("scannedAt", "scannedAt", { unique: false });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readBatch(db, limit) {
  return new Promise((resolve, reject) => {
    const out = [];
    const req = db.transaction("queue").objectStore("queue").index("scannedAt").openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c || out.length >= limit) return resolve(out);
      out.push(c.value);
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

function deleteKeys(db, keys) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("queue", "readwrite");
    keys.forEach((k) => tx.objectStore("queue").delete(k));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function flushQueue() {
  const db = await openDb();
  let synced = 0;
  for (;;) {
    const batch = await readBatch(db, 200);
    if (!batch.length) break;
    const res = await fetch("/api/attendance/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: batch }),
      credentials: "same-origin",
    });
    // Throwing makes the browser retry the sync later with back-off
    if (!res.ok) throw new Error(`sync failed: ${res.status}`);
    const { results } = await res.json();
    if (!results.length) break;
    await deleteKeys(db, results.map((r) => r.clientId));
    synced += results.length;
  }
  db.close();
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((c) => c.postMessage({ type: "nokhba-synced", synced }));
}
