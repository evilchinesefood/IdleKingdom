const CACHE = "idlekingdom-v51";
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
  "./Source/Vendor/WebAwesome/styles/layers.css",
  "./Source/Vendor/WebAwesome/styles/native.css",
  "./Source/Vendor/WebAwesome/styles/utilities.css",
  "./Source/Vendor/WebAwesome/styles/themes/default.css",
  "./Source/Vendor/WebAwesome/styles/color/palettes/default.css",
  "./Source/Vendor/WebAwesome/styles/color/palettes/base.css",
  "./Source/Vendor/WebAwesome/styles/utilities/align-items.css",
  "./Source/Vendor/WebAwesome/styles/utilities/border-radius.css",
  "./Source/Vendor/WebAwesome/styles/utilities/flex-wrap.css",
  "./Source/Vendor/WebAwesome/styles/utilities/fouce.css",
  "./Source/Vendor/WebAwesome/styles/utilities/gap.css",
  "./Source/Vendor/WebAwesome/styles/utilities/justify-content.css",
  "./Source/Vendor/WebAwesome/styles/utilities/layout.css",
  "./Source/Vendor/WebAwesome/styles/utilities/placeholder.css",
  "./Source/Vendor/WebAwesome/styles/utilities/scroll-lock.css",
  "./Source/Vendor/WebAwesome/styles/utilities/size.css",
  "./Source/Vendor/WebAwesome/styles/utilities/text.css",
  "./Source/Vendor/WebAwesome/styles/utilities/variants.css",
  "./Source/Vendor/WebAwesome/styles/utilities/visually-hidden.css",
  "./Source/Vendor/FontAwesome/css/fontawesome.css",
  "./Source/Vendor/FontAwesome/css/duotone.css",
  "./Source/Vendor/FontAwesome/webfonts/fa-duotone-900.woff2",
];

// 256 WA chunks are vendored; keep the ceiling comfortably above a session's loads.
const MAX_RUNTIME = 300;
let runtimePuts = 0;
const SHELL_URLS = new Set(
  SHELL.map((u) => new URL(u, self.location.href).href),
);

// Bound runtime cache growth: drop oldest non-SHELL entries beyond MAX_RUNTIME.
function trim(cache) {
  return cache.keys().then((keys) => {
    const runtime = keys.filter((req) => !SHELL_URLS.has(req.url));
    const over = runtime.length - MAX_RUNTIME;
    if (over <= 0) return;
    return Promise.all(runtime.slice(0, over).map((req) => cache.delete(req)));
  });
}

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
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // leave cross-origin alone

  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request)
        .then((res) => {
          // Runtime-cache successful same-origin GETs so the lazily-imported
          // Web Awesome component/chunk files (not in SHELL) survive offline.
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((c) =>
                c.put(e.request, copy).then(() => {
                  // trim() enumerates every cache key — sweep every 20th put only
                  if (++runtimePuts % 20 === 0) return trim(c);
                }),
              )
              .catch(() => {});
          }
          return res;
        })
        .catch(() => {
          // Only fall back to the app shell for NAVIGATIONS — never return HTML
          // for a failed script/style/font request (that breaks module/MIME).
          if (e.request.mode === "navigate")
            return caches.match("./Index.html");
          return Response.error();
        });
    }),
  );
});
