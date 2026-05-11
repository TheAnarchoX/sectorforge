const CACHE_NAME = "sectorforge-app-shell-v1";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/manifest.webmanifest",
  "/pwa-192.png",
  "/pwa-512.png",
  "/maskable-512.png",
];
const APP_SHELL_ASSET_PATTERN = /\b(?:href|src)="([^"]+)"/g;
const RUNTIME_PATH_PREFIXES = ["/api/", "/hubs/"];

const isRuntimePath = (url) => RUNTIME_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));

const discoverBuildAssets = async (cache) => {
  const response = await fetch("/index.html", { cache: "no-store" });

  if (!response.ok) {
    return [];
  }

  const responseCopy = response.clone();
  const html = await response.text();
  await cache.put("/index.html", responseCopy);

  return Array.from(html.matchAll(APP_SHELL_ASSET_PATTERN))
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => url.origin === self.location.origin && url.pathname.startsWith("/assets/"))
    .map((url) => url.pathname);
};

const cacheAppShell = async () => {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(CORE_ASSETS);

  const buildAssets = await discoverBuildAssets(cache);

  if (buildAssets.length > 0) {
    await cache.addAll(buildAssets);
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    cacheAppShell().then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin || isRuntimePath(url)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", responseCopy));
          }

          return response;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        if (!response || response.status !== 200) {
          return response;
        }

        const responseCopy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy));
        return response;
      });
    }),
  );
});
