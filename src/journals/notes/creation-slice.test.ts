import { describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import { journalsCoreModule } from "../module";

import { creationAllowedOn, noteCreationSlice } from "./creation-slice";

describe("creationAllowedOn", () => {
  it("allows both devices by default", () => {
    expect(creationAllowedOn("all", "desktop")).toBe(true);
    expect(creationAllowedOn("all", "mobile")).toBe(true);
  });

  it("allows only the desktop when the rule names it", () => {
    expect(creationAllowedOn("desktop", "desktop")).toBe(true);
    expect(creationAllowedOn("desktop", "mobile")).toBe(false);
  });

  it("allows only the mobile app when the rule names it", () => {
    expect(creationAllowedOn("mobile", "mobile")).toBe(true);
    expect(creationAllowedOn("mobile", "desktop")).toBe(false);
  });
});

describe("noteCreationSlice repair on load", () => {
  it("an unknown device list reads as all devices and logs the repair", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { noteCreation: { devices: "tablet" } },
      allow: { dataRepair: true },
    });

    expect(harness.settings.getSlice(noteCreationSlice).state.devices).toBe("all");
    const repair = harness.logs.records.find((record) => record.message === "slice fields reset to defaults");
    expect(repair?.fields).toMatchObject({ sliceKey: "noteCreation", fields: ["devices"] });
  });
});
