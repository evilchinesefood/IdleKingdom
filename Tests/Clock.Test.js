import { describe, it, expect } from "./Runner.js";
import { Clock, FakeClock } from "../Source/Engine/Clock.js";

describe("Clock", () => {
  it("Clock.now() returns a finite ms number", () => {
    const c = new Clock();
    const t = c.now();
    expect(typeof t).toBe("number");
    expect(Number.isFinite(t)).toBe(true);
  });

  it("FakeClock starts at 0 by default", () => {
    const fc = new FakeClock();
    expect(fc.now()).toBe(0);
  });

  it("FakeClock starts at the provided ms", () => {
    const fc = new FakeClock(1000);
    expect(fc.now()).toBe(1000);
  });

  it("setNow sets absolute time", () => {
    const fc = new FakeClock(5);
    fc.setNow(500);
    expect(fc.now()).toBe(500);
  });

  it("advance adds to current time and returns the new now", () => {
    const fc = new FakeClock(100);
    const after = fc.advance(250);
    expect(after).toBe(350);
    expect(fc.now()).toBe(350);
  });
});
