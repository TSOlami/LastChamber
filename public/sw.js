/* Last Chamber service worker.
   Network-first so updates always win; cache is the offline fallback,
   which keeps solo and hot seat playable with no connection. */

const CACHE = "lc-v3";
const SHELL = [
  "/",
  "/css/style.css",
  "/js/app.mjs",
  "/js/world.mjs",
  "/js/booth3d.mjs",
  "/js/automaton.mjs",
  "/js/booth2d.mjs",
  "/shared/engine.mjs",
  "/vendor/three.module.min.js",
  "/vendor/addons/loaders/GLTFLoader.js",
  "/vendor/addons/utils/BufferGeometryUtils.js",
  "/vendor/addons/environments/RoomEnvironment.js",
  "/vendor/qrcode.mjs",
  "/models/booth.glb",
  "/fonts/rye.woff2",
  "/fonts/barlow-sc-500.woff2",
  "/fonts/barlow-sc-600.woff2",
  "/fonts/barlow-sc-700.woff2",
  "/fonts/courier-prime-400.woff2",
  "/fonts/courier-prime-700.woff2",
  "/manifest.webmanifest",
  "/icon.svg"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then(hit => hit || (e.request.mode === "navigate" ? caches.match("/") : undefined)))
  );
});
