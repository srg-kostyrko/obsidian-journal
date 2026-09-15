import { describe, expect, it } from "vitest";

import { freeName } from "./free-name";

const nth = (index: number): string => `Daily ${index}`;

describe("freeName", () => {
  it("keeps the first name when nothing uses it", () => {
    expect(freeName("Daily", nth, () => false)).toBe("Daily");
  });

  it("numbers from 2 when the first name is taken", () => {
    expect(freeName("Daily", nth, (name) => name === "Daily")).toBe("Daily 2");
  });

  it("skips every numbered name already taken", () => {
    const taken = new Set(["Daily", "Daily 2", "Daily 3"]);

    expect(freeName("Daily", nth, (name) => taken.has(name))).toBe("Daily 4");
  });
});
