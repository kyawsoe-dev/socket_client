const CACHE_NAME = "ks-chat-app-cache-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/assets/images/icon-192.png",
  "/assets/images/icon-512.png",
  "/assets/audio/send.mp3",
  "/assets/audio/receive.mp3",
  "/assets/audio/typing.mp3",
  "/assets/audio/call.mp3",
  "/assets/audio/end.mp3",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener("activate", event => {
  const allowedCaches = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.map(name => {
        if (!allowedCaches.includes(name)) return caches.delete(name);
      }))
    )
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});