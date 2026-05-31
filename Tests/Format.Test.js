import { describe, it, expect } from "./Runner.js";
import { formatNumber, formatRate } from "../Source/UI/Render/Format.js";

describe("Format.formatNumber", () => {
  it("renders small integers exactly", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(25)).toBe("25");
    expect(formatNumber(999)).toBe("999");
  });
  it("shows one decimal for small non-integers", () => {
    expect(formatNumber(2)).toBe("2");
    expect(formatNumber(2.5)).toBe("2.5");
    expect(formatNumber(0.1)).toBe("0.1");
  });
  it("uses K above one thousand", () => {
    expect(formatNumber(1000)).toBe("1.0K");
    expect(formatNumber(1234)).toBe("1.2K");
    expect(formatNumber(57600)).toBe("57.6K");
  });
  it("uses M above one million", () => {
    expect(formatNumber(1000000)).toBe("1.0M");
    expect(formatNumber(144000)).toBe("144.0K");
    expect(formatNumber(2500000)).toBe("2.5M");
  });
  it("uses B above one billion", () => {
    expect(formatNumber(3500000000)).toBe("3.5B");
  });
  it("clamps tiny negatives and NaN to 0", () => {
    expect(formatNumber(-0.0001)).toBe("0");
    expect(formatNumber(NaN)).toBe("0");
  });
});

describe("Format.formatRate", () => {
  it("suffixes /s and keeps one decimal under 1000", () => {
    expect(formatRate(2)).toBe("2.0/s");
    expect(formatRate(0.1)).toBe("0.1/s");
    expect(formatRate(0)).toBe("0/s");
  });
  it("compacts large rates with K/M", () => {
    expect(formatRate(1500)).toBe("1.5K/s");
  });
});
