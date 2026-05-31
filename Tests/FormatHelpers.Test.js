import { describe, it, expect } from "./Runner.js";
import {
  fmtNum,
  fmtRate,
  fmtCountdown,
  fmtCost,
  affordClass,
} from "../Source/UI/Format/Format.js";

describe("Format.fmtNum", () => {
  it("trims integers and rounds to 1 decimal otherwise", () => {
    expect(fmtNum(25)).toBe("25");
    expect(fmtNum(25.0)).toBe("25");
    expect(fmtNum(2.04)).toBe("2");
    expect(fmtNum(2.5)).toBe("2.5");
    expect(fmtNum(1234.56)).toBe("1,235");
  });
  it("formats thousands with separators", () => {
    expect(fmtNum(57600)).toBe("57,600");
    expect(fmtNum(144000.4)).toBe("144,000");
  });
  it("handles zero and tiny floats", () => {
    expect(fmtNum(0)).toBe("0");
    expect(fmtNum(0.04)).toBe("0");
    expect(fmtNum(0.1)).toBe("0.1");
  });
});

describe("Format.fmtRate", () => {
  it("appends /s and keeps 2 decimals for small rates", () => {
    expect(fmtRate(2.0)).toBe("2/s");
    expect(fmtRate(0.1)).toBe("0.1/s");
    expect(fmtRate(0.05)).toBe("0.05/s");
    expect(fmtRate(0)).toBe("0/s");
  });
});

describe("Format.fmtCountdown", () => {
  it("formats ms as M:SS under an hour", () => {
    expect(fmtCountdown(0)).toBe("0:00");
    expect(fmtCountdown(1000)).toBe("0:01");
    expect(fmtCountdown(120000)).toBe("2:00");
    expect(fmtCountdown(65000)).toBe("1:05");
  });
  it("formats H:MM:SS at or above an hour", () => {
    expect(fmtCountdown(3600000)).toBe("1:00:00");
    expect(fmtCountdown(3661000)).toBe("1:01:01");
  });
  it("clamps negatives to zero", () => {
    expect(fmtCountdown(-500)).toBe("0:00");
  });
});

describe("Format.fmtCost", () => {
  it("renders a cost with a currency glyph", () => {
    expect(fmtCost(9, "research")).toBe("9 📜");
    expect(fmtCost(30, "renown")).toBe("30 🛡️");
    expect(fmtCost(15.0, "gold")).toBe("15 🪙");
  });
});

describe("Format.affordClass", () => {
  it("returns 'affordable' when true, 'locked' when false", () => {
    expect(affordClass(true)).toBe("affordable");
    expect(affordClass(false)).toBe("locked");
  });
});
