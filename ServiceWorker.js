const CACHE = "idlekingdom-v3";
const SHELL = [
  "./",
  "./Index.html",
  "./Manifest.webmanifest",
  "./Source/Main.js",
  "./Source/Styles/Reset.css",
  "./Source/Styles/Theme.css",
  "./Source/Styles/Layout.css",
  "./Source/Styles/Graph.css",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches
      .match(e.request)
      .then(
        (hit) =>
          hit || fetch(e.request).catch(() => caches.match("./Index.html")),
      ),
  );
});
