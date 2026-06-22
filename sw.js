// FIFA WC 2026 — Service Worker
// Strategy:
//   - App shell (HTML/CSS/JS/icon): pre-cached on install for instant offline boot
//   - Flag CDN + script CDNs: cache-first (these never change)
//   - Appwrite REST: network-first (live data preferred, cached fallback when offline)
//   - Appwrite realtime (WebSocket): not intercepted; the browser handles it natively
//   - Anything else same-origin: stale-while-revalidate

const CACHE_VERSION = "1781800001";
const APP_CACHE = `wc2026-app-${CACHE_VERSION}`;
const RUNTIME_CACHE = `wc2026-runtime-${CACHE_VERSION}`;

// Files that must be available offline for the app to boot
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./fixtures.js",
  "./third-place-matrix.js",
  "./live-scores.js",
  "./manifest.webmanifest",
  "./icon.png",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== APP_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Appwrite REST API: prefer network so live writes propagate; fall back to cache offline
  if (url.hostname.endsWith(".appwrite.io")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Flag images + CDN scripts (incl. the versioned Firebase SDK on gstatic):
  // cache-first, they're effectively immutable.
  if (
    url.hostname === "flagcdn.com" ||
    url.hostname === "upload.wikimedia.org" ||
    url.hostname === "cdn.jsdelivr.net" ||
    url.hostname === "cdnjs.cloudflare.com" ||
    url.hostname === "www.gstatic.com"
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Same-origin app files: stale-while-revalidate (offline-first, refreshes in background)
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    return cached || Response.error();
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    const cached = await caches.match(req);
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res && res.status === 200) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

// Listen for an explicit message from the page to force-activate the new SW
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

