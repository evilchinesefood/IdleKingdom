import { describe, it, expect } from "./Runner.js";
import { fmtCost as engFmtCost } from "../Source/Engine/Systems/EconomySystem.js";
import { fmtCost as uiFmtCost } from "../Source/UI/Format/Format.js";
import { upgradeCost } from "../Source/Engine/Systems/EconomySystem.js";

// Drift trip-wire: the engine's cost formatter (reject toasts) MUST render every value
// identically to the UI's fmtCost (panel buttons). If these ever diverge, a reject toast
// and the button it refers to would show different numbers for the same cost.
describe("CostFormat drift trip-wire (engine fmtCost === UI fmtCost)", () => {
  const content = { machines: { gatherer: { upgradeBase: 15 } } };
  const cases = [
    9, // integer
    40.2, // sub-1000 decimal
    999.9, // just under the separator threshold
    1234.4, // separator + rounds down
    1223393, // large, multi-group separators
    upgradeCost("gatherer", 50, content), // knee-region real cost (~10,421.5)
  ];
  for (const v of cases) {
    it(`renders ${v} identically`, () => {
      expect(engFmtCost(v)).toBe(uiFmtCost(v));
    });
  }

  it("agree on the exact strings (pins the shared behavior)", () => {
    expect(engFmtCost(9)).toBe("9");
    expect(engFmtCost(40.2)).toBe("40.2");
    expect(engFmtCost(999.9)).toBe("999.9");
    expect(engFmtCost(1000)).toBe("1,000");
    expect(engFmtCost(1234.4)).toBe("1,234");
    expect(engFmtCost(1223393)).toBe("1,223,393");
  });
});
