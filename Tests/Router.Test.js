import { describe, it, expect } from "./Runner.js";
import { Router, parsePath, DEFAULT_ROUTE } from "../Source/UI/Router.js";

// A minimal History-API window: location.pathname is mutated by push/replaceState,
// and addEventListener captures popstate so a test can fire it.
function mockWin(pathname, baseHref = "/kingdom/") {
  const handlers = {};
  const win = {
    document: { baseURI: "http://x" + baseHref },
    location: { pathname },
    history: {
      pushState: (s, t, url) => {
        win.location.pathname = new URL(url, "http://x").pathname;
      },
      replaceState: (s, t, url) => {
        win.location.pathname = new URL(url, "http://x").pathname;
      },
    },
    addEventListener: (type, fn) => {
      handlers[type] = fn;
    },
    _fire: (type) => handlers[type] && handlers[type](),
  };
  return win;
}

describe("Router.parsePath", () => {
  it("extracts the route segment after the base", () => {
    expect(parsePath("/kingdom/research", "/kingdom/")).toBe("research");
    expect(parsePath("/kingdom/war", "/kingdom/")).toBe("war");
  });
  it("defaults a bare base or unknown segment to the default route", () => {
    expect(parsePath("/kingdom/", "/kingdom/")).toBe(DEFAULT_ROUTE);
    expect(parsePath("/kingdom/bogus", "/kingdom/")).toBe(DEFAULT_ROUTE);
  });
  it("clamps the retired expeditions/heroes deep links to the default route", () => {
    // .htaccess still loads the shell for these stale paths; the router treats
    // them as unknown and clamps to the default route.
    expect(parsePath("/kingdom/expeditions", "/kingdom/")).toBe(DEFAULT_ROUTE);
    expect(parsePath("/kingdom/heroes", "/kingdom/")).toBe(DEFAULT_ROUTE);
  });
  it("works at a root base too (local dev)", () => {
    expect(parsePath("/factory", "/")).toBe("factory");
    expect(parsePath("/", "/")).toBe(DEFAULT_ROUTE);
  });
});

describe("Router (History-API path routing)", () => {
  it("start() normalizes a bare base to <base>/factory via replaceState + emits", () => {
    const win = mockWin("/kingdom/");
    const r = new Router(win);
    let emitted = null;
    r.onChange((route) => (emitted = route));
    r.start();
    expect(r.current).toBe("factory");
    expect(win.location.pathname).toBe("/kingdom/factory");
    expect(emitted).toBe("factory");
  });
  it("start() keeps a valid deep-link route", () => {
    const win = mockWin("/kingdom/war");
    const r = new Router(win).start();
    expect(r.current).toBe("war");
    expect(win.location.pathname).toBe("/kingdom/war");
  });
  it("navigate() pushes the clean path + emits; re-navigating the same route is a no-op", () => {
    const win = mockWin("/kingdom/factory");
    const r = new Router(win).start();
    const seen = [];
    r.onChange((route) => seen.push(route));
    r.navigate("war");
    expect(r.current).toBe("war");
    expect(win.location.pathname).toBe("/kingdom/war");
    r.navigate("war"); // already here -> no emit, no dup history
    expect(seen).toEqual(["war"]);
  });
  it("popstate (back/forward) re-reads the path and emits", () => {
    const win = mockWin("/kingdom/research");
    const r = new Router(win).start();
    let last = null;
    r.onChange((route) => (last = route));
    win.location.pathname = "/kingdom/factory"; // simulate a Back navigation
    win._fire("popstate");
    expect(r.current).toBe("factory");
    expect(last).toBe("factory");
  });
  it("navigate() clamps an unknown route to the default", () => {
    const win = mockWin("/kingdom/research");
    const r = new Router(win).start();
    r.navigate("bogus");
    expect(r.current).toBe(DEFAULT_ROUTE);
    expect(win.location.pathname).toBe("/kingdom/factory");
  });
});
