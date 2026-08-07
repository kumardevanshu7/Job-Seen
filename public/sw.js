const CACHE_NAME = "jobseen-pwa-v3";
const PRECACHE = [
  "/offline.html",
  "/manifest.json",
  "/logo/android-chrome-192x192.png",
  "/logo/android-chrome-512x512.png",
  "/logo/apple-touch-icon.png",
];

async function precacheAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    PRECACHE.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (response.ok) await cache.put(url, response);
      } catch {
        // Skip missing/unreachable assets — never fail SW install
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheAssets().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api")) return;

  // Never cache the service worker or manifest with stale network-first put loops
  if (url.pathname === "/sw.js" || url.pathname === "/manifest.json") {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.method === "GET") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate" || request.destination === "document") {
          const offline = await caches.match("/offline.html");
          if (offline) return offline;
        }
        return Response.error();
      })
  );
});
