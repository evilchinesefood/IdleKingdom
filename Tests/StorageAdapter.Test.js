import { describe, it, expect } from "./Runner.js";
import { MemoryStorageAdapter } from "../Source/Engine/Persistence/MemoryStorageAdapter.js";
import { LocalStorageAdapter } from "../Source/Engine/Persistence/LocalStorageAdapter.js";

describe("MemoryStorageAdapter", () => {
  it("returns null for a missing key", () => {
    const s = new MemoryStorageAdapter();
    expect(s.get("nope")).toBe(null);
  });

  it("round-trips set/get", () => {
    const s = new MemoryStorageAdapter();
    s.set("k", "v");
    expect(s.get("k")).toBe("v");
  });

  it("remove deletes a key", () => {
    const s = new MemoryStorageAdapter();
    s.set("k", "v");
    s.remove("k");
    expect(s.get("k")).toBe(null);
  });
});

function makeFakeStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
    _throwOnSet() {
      this.setItem = () => {
        throw new Error("QuotaExceededError");
      };
    },
  };
}

describe("LocalStorageAdapter", () => {
  it("round-trips through an injected storage object", () => {
    const fake = makeFakeStorage();
    const s = new LocalStorageAdapter(fake);
    s.set("k", "v");
    expect(s.get("k")).toBe("v");
    expect(fake.getItem("k")).toBe("v");
  });

  it("get returns null for a missing key", () => {
    const s = new LocalStorageAdapter(makeFakeStorage());
    expect(s.get("missing")).toBe(null);
  });

  it("remove deletes a key", () => {
    const fake = makeFakeStorage();
    const s = new LocalStorageAdapter(fake);
    s.set("k", "v");
    s.remove("k");
    expect(s.get("k")).toBe(null);
  });

  it("set swallows quota errors and returns false", () => {
    const fake = makeFakeStorage();
    fake._throwOnSet();
    const s = new LocalStorageAdapter(fake);
    expect(s.set("k", "v")).toBe(false);
  });

  it("set returns true on success", () => {
    const s = new LocalStorageAdapter(makeFakeStorage());
    expect(s.set("k", "v")).toBe(true);
  });
});
