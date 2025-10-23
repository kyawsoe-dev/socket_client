const CACHE_NAME = "ks-chat-app-cache-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/assets/images/icon-192.png",
  "/assets/images/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
