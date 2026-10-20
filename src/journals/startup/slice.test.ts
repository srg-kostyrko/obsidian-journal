import { describe, expect, it } from "vitest";

import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";
import { testContainer } from "@/testing";

import { startupSlice } from "./slice";

const sliceModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(startupSlice);
  },
};

describe("startup slice repair on load", () => {
  // An override is its days and its journal; a default journal name would open some other
  // journal's note, or none, on those days.
  it("an override with an unreadable journal name is dropped rather than given a default name", async () => {
    const kept = { weekdays: [6, 0], journalName: "weekend" };
    const harness = await testContainer({
      modules: [sliceModule],
      data: {
        startup: {
          journalName: "daily",
          overrides: [{ weekdays: [1], journalName: 5 }, kept],
          openMode: "tab",
          pinned: true,
        },
      },
      allow: { dataRepair: true },
    });

    expect(harness.settings.getSlice(startupSlice).state).toEqual({
      journalName: "daily",
      overrides: [kept],
      openMode: "tab",
      pinned: true,
    });
  });
});
