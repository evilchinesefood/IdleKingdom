// This route list is mirrored in two spots that can't import it — the inline
// <base> script in Index.html and the rewrite rule in .htaccess. Adding a route
// means editing all three (else it 404s on deep-link / mis-strips the base).
// (.htaccess also keeps the dead expeditions|heroes paths so stale clients still
// load the shell; this list clamps any unknown segment -> the default route.)
export const ROUTES = ["factory", "research", "war"];
export const DEFAULT_ROUTE = "factory";

// The app is served under a base path (e.g. "/kingdom/"). An inline <base href>
// in Index.html (computed for both local dev and the deploy subpath) is the single
// source of truth; the router reads it back via document.baseURI.
function basePath(win) {
  try {
    return new URL(win.document.baseURI).pathname || "/";
  } catch {
    return "/";
  }
}

// Strip the base prefix off a pathname and return the first segment as a route
// (or the default when it isn't one). Pure — used for both initial + popstate parse.
export function parsePath(pathname, base) {
  let p = String(pathname || "");
  if (base && base !== "/" && p.indexOf(base) === 0) p = p.slice(base.length);
  const seg = p.replace(/^\/+/, "").split("/")[0];
  return ROUTES.includes(seg) ? seg : DEFAULT_ROUTE;
}

export class Router {
  constructor(win = window) {
    this.win = win;
    this.base = basePath(win);
    this._listeners = [];
    this.current = parsePath(win.location.pathname, this.base);
    // History API: back/forward fire popstate (pushState/replaceState do NOT, so
    // navigate() emits itself).
    this._onPop = () => {
      const next = parsePath(this.win.location.pathname, this.base);
      if (next !== this.current) {
        this.current = next;
        this._emit();
      }
    };
  }
  start() {
    this.win.addEventListener("popstate", this._onPop);
    // Normalize a bare base / unknown path to the default route in the address bar
    // (replaceState so it doesn't add a history entry).
    let p = this.win.location.pathname;
    if (this.base && this.base !== "/" && p.indexOf(this.base) === 0)
      p = p.slice(this.base.length);
    const seg = p.replace(/^\/+/, "").split("/")[0];
    if (!ROUTES.includes(seg)) {
      this.current = DEFAULT_ROUTE;
      this.win.history.replaceState({}, "", this.base + DEFAULT_ROUTE);
    } else {
      this.current = seg;
    }
    this._emit();
    return this;
  }
  navigate(route) {
    if (!ROUTES.includes(route)) route = DEFAULT_ROUTE;
    if (route === this.current) return; // already here — no dup history entry
    this.current = route;
    this.win.history.pushState({}, "", this.base + route);
    this._emit();
  }
  onChange(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((f) => f !== fn);
    };
  }
  _emit() {
    for (const fn of this._listeners) fn(this.current);
  }
}
