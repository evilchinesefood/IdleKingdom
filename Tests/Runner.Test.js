import { describe, it, expect, runList } from "./Runner.js";

describe("Runner matchers", () => {
  it("toBe uses Object.is", () => {
    expect(1 + 1).toBe(2);
    expect("a").toBe("a");
  });

  it("toEqual does deep structural equality", () => {
    expect({ a: [1, 2], b: { c: 3 } }).toEqual({ a: [1, 2], b: { c: 3 } });
  });

  it("toBeCloseTo compares floats within epsilon", () => {
    expect(0.1 + 0.2).toBeCloseTo(0.3, 1e-9);
  });

  it("toThrow catches thrown errors and matches substrings", () => {
    expect(() => {
      throw new Error("cycle detected");
    }).toThrow("cycle");
    expect(() => {
      throw new Error("boom");
    }).toThrow();
  });

  it("toBeTruthy passes on truthy values", () => {
    expect(1).toBeTruthy();
    expect("x").toBeTruthy();
    expect([]).toBeTruthy();
  });

  it("supports async tests", async () => {
    const v = await Promise.resolve(42);
    expect(v).toBe(42);
  });

  it("failing matchers throw (negative path)", () => {
    let threw = false;
    try {
      expect(1).toBe(2);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    threw = false;
    try {
      expect({ a: 1 }).toEqual({ a: 2 });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    threw = false;
    try {
      expect(0.1).toBeCloseTo(0.2, 1e-9);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    threw = false;
    try {
      expect(() => 1).toThrow();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    threw = false;
    try {
      expect(0).toBeTruthy();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("deepEqual does not conflate arrays with index-keyed objects", () => {
    expect(() => expect([1, 2]).toEqual({ 0: 1, 1: 2 })).toThrow();
  });
});

describe("Runner failure path", () => {
  it("runList reports failed > 0 when a test throws", async () => {
    const result = await runList([
      { label: "x", fn: () => { throw new Error("boom"); } },
      { label: "y", fn: () => {} },
    ]);
    expect(result.failed).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.total).toBe(2);
  });
});
