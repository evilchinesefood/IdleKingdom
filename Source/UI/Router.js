export const ROUTES = ["factory", "research", "expeditions", "heroes"];
export const DEFAULT_ROUTE = "factory";

export function parseHash(hash) {
  const m = String(hash || "")
    .replace(/^#\/?/, "")
    .split("/")[0];
  return ROUTES.includes(m) ? m : DEFAULT_ROUTE;
}

export class Router {
  constructor(win = window) {
    this.win = win;
    this._listeners = [];
    this.current = parseHash(win.location.hash);
    this._onHash = () => {
      const next = parseHash(this.win.location.hash);
      if (next !== this.current) {
        this.current = next;
        this._emit();
      }
    };
  }
  start() {
    this.win.addEventListener("hashchange", this._onHash);
    if (!this.win.location.hash) this.navigate(DEFAULT_ROUTE);
    else this._emit();
    return this;
  }
  navigate(route) {
    if (!ROUTES.includes(route)) route = DEFAULT_ROUTE;
    this.win.location.hash = "#/" + route;
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
