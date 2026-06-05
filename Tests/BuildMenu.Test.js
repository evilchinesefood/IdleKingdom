import { describe, it, expect } from "./Runner.js";
import { shouldCloseBmPopover } from "../Source/UI/BuildMenu.js";

// Minimal fake node that supports classList.contains
function fakeNode(classes = []) {
  return { classList: { contains: (c) => classes.includes(c) } };
}

describe("shouldCloseBmPopover", () => {
  it("returns false when no popover is open", () => {
    expect(shouldCloseBmPopover(null, [])).toBe(false);
    expect(shouldCloseBmPopover("", [])).toBe(false);
  });

  it("returns true when path contains no .bm-cell (outside click)", () => {
    const path = [fakeNode(["graph-host"]), fakeNode(["screen"])];
    expect(shouldCloseBmPopover("workshop", path)).toBe(true);
  });

  it("returns false when path contains .bm-cell (inside click)", () => {
    const path = [
      fakeNode(["bm-place"]),
      fakeNode(["bm-popover"]),
      fakeNode(["bm-cell"]),
      fakeNode(["bm-machines"]),
    ];
    expect(shouldCloseBmPopover("workshop", path)).toBe(false);
  });

  it("returns false when clicking the machine button itself (.bm-cell in path)", () => {
    const path = [fakeNode(["bm-machine", "selected"]), fakeNode(["bm-cell"])];
    expect(shouldCloseBmPopover("smelter", path)).toBe(false);
  });

  it("returns true for an empty composed path with open popover", () => {
    // e.g. a synthetic event with no path — should close to be safe
    expect(shouldCloseBmPopover("gatherer", [])).toBe(true);
  });
});
