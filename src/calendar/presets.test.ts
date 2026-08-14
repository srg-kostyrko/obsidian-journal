import { describe, expect, it } from "vitest";

import { detectCurrentPreset } from "./presets";

describe("detectCurrentPreset", () => {
  it("returns the ISO 8601 preset for dow=1, doy=4", () => {
    const result = detectCurrentPreset({ dow: 1, doy: 4 });
    expect(result).not.toBe("custom");
    if (result === "custom") return;
    expect(result.id).toBe("iso-8601");
  });

  it("returns the Western preset for dow=0, doy=6", () => {
    const result = detectCurrentPreset({ dow: 0, doy: 6 });
    expect(result).not.toBe("custom");
    if (result === "custom") return;
    expect(result.id).toBe("western");
  });

  it("returns the Middle Eastern preset for dow=6, doy=12", () => {
    const result = detectCurrentPreset({ dow: 6, doy: 12 });
    expect(result).not.toBe("custom");
    if (result === "custom") return;
    expect(result.id).toBe("middle-eastern");
  });

  it('returns "custom" for a valid combination not in the preset list', () => {
    // dow=3 (Wed start), doy=7 → first day of Jan in week 1 = 7 + 3 - 7 = 3
    const result = detectCurrentPreset({ dow: 3, doy: 7 });
    expect(result).toBe("custom");
  });
});
