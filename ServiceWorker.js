const CACHE = "idlekingdom-v6";
const SHELL = [
  "./",
  "./Index.html",
  "./Manifest.webmanifest",
  "./Source/Main.js",
  "./Source/Styles/Fonts.css",
  "./Source/Styles/Reset.css",
  "./Source/Styles/Theme.css",
  "./Source/Styles/WaTheme.css",
  "./Source/Styles/Layout.css",
  "./Source/Styles/Graph.css",
  "./Source/Vendor/Fonts/cinzel-latin-700-normal.woff2",
  "./Source/Vendor/Fonts/eb-garamond-latin-400-normal.woff2",
  "./Source/Vendor/Fonts/eb-garamond-latin-700-normal.woff2",
  "./Source/Vendor/WebAwesome/webawesome.loader.js",
  "./Source/Vendor/WebAwesome/styles/webawesome.css",
  "./Source/Vendor/FontAwesome/css/fontawesome.css",
  "./Source/Vendor/FontAwesome/css/duotone.css",
  "./Source/Vendor/FontAwesome/webfonts/fa-duotone-900.woff2",
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
