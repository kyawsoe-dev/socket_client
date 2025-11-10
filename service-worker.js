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

self.addEventListener("push", event => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch (err) {
    console.error("Invalid push payload:", err);
    return;
  }

  const options = {
    body: data.body || "You have a new message!",
    icon: data.icon || "/assets/images/icon-192.png",
    badge: "/assets/images/icon-192.png",
    data: data.data || {},
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "New Notification", options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const convId = event.notification.data?.conversationId;
  const url = convId ? `/index.html?conv=${convId}` : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientsArr => {
        for (const c of clientsArr) if (c.url.includes('/index.html')) return c.focus();
        return clients.openWindow(url);
      })
  );
});