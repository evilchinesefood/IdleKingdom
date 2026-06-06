const CACHE = "idlekingdom-v59";
const SHELL_FIRST_PARTY = [
  "./",
  "./Index.html",
  "./Manifest.webmanifest",
  // Entry point
  "./Source/Main.js",
  // Engine — core
  "./Source/Engine/Clock.js",
  "./Source/Engine/Game.js",
  "./Source/Engine/GameState.js",
  "./Source/Engine/Intents.js",
  "./Source/Engine/Reducer.js",
  "./Source/Engine/Snapshot.js",
  // Engine — content
  "./Source/Engine/Content/Content.js",
  "./Source/Engine/Content/Machines.js",
  "./Source/Engine/Content/Recipes.js",
  "./Source/Engine/Content/ResearchNodes.js",
  "./Source/Engine/Content/Resources.js",
  "./Source/Engine/Content/StartState.js",
  "./Source/Engine/Content/Territories.js",
  // Engine — persistence
  "./Source/Engine/Persistence/LocalStorageAdapter.js",
  "./Source/Engine/Persistence/MemoryStorageAdapter.js",
  "./Source/Engine/Persistence/Migrations.js",
  "./Source/Engine/Persistence/SaveManager.js",
  "./Source/Engine/Persistence/StorageAdapter.js",
  // Engine — simulation
  "./Source/Engine/Simulation/Offline.js",
  "./Source/Engine/Simulation/RateSolver.js",
  "./Source/Engine/Simulation/Tick.js",
  "./Source/Engine/Simulation/Topology.js",
  // Engine — systems
  "./Source/Engine/Systems/EconomySystem.js",
  "./Source/Engine/Systems/ProgressionSystem.js",
  "./Source/Engine/Systems/ResearchSystem.js",
  "./Source/Engine/Systems/SiegeSystem.js",
  // UI — app shell
  "./Source/UI/App.js",
  "./Source/UI/Router.js",
  "./Source/UI/Hud.js",
  "./Source/UI/Sound.js",
  "./Source/UI/Prefs.js",
  "./Source/UI/Icons.js",
  "./Source/UI/Tooltip.js",
  // UI — graph
  "./Source/UI/GraphView.js",
  "./Source/UI/GraphInput.js",
  // UI — inspectors / build
  "./Source/UI/BuildMenu.js",
  "./Source/UI/BuildingInspector.js",
  "./Source/UI/BulkInspector.js",
  "./Source/UI/NodeInspector.js",
  // UI — panels
  "./Source/UI/ResearchTree.js",
  "./Source/UI/WarBoard.js",
  "./Source/UI/OfflineSummary.js",
  "./Source/UI/Settings.js",
  "./Source/UI/Victory.js",
  // UI — render / format / logic
  "./Source/UI/Render/Dom.js",
  "./Source/UI/Render/Format.js",
  "./Source/UI/Render/Svg.js",
  "./Source/UI/Format/Format.js",
  "./Source/UI/Logic/Selectors.js",
  // Styles
  "./Source/Styles/Fonts.css",
  "./Source/Styles/Reset.css",
  "./Source/Styles/Theme.css",
  "./Source/Styles/WaTheme.css",
  "./Source/Styles/Layout.css",
  "./Source/Styles/Graph.css",
];
const SHELL_VENDOR = [
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
const SHELL = [...SHELL_FIRST_PARTY, ...SHELL_VENDOR];

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
      .then((c) =>
        // First-party modules are atomic: a miss fails install and retries next visit.
        c.addAll(SHELL_FIRST_PARTY).then(() =>
          // Vendor/font assets are tolerant: a CDN miss won't block install.
          Promise.allSettled(SHELL_VENDOR.map((u) => c.add(u))),
        ),
      )
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
