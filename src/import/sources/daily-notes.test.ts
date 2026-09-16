import { describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import { importCoreModule } from "../module";

import { DailyNotesSource } from "./daily-notes";

async function readWith(options: object | undefined, enabled = true) {
  const harness = await testContainer({ modules: [importCoreModule] });
  if (options !== undefined) harness.host.putCorePlugin("daily-notes", { options }, enabled);
  return harness.resolve(DailyNotesSource).read();
}

describe("DailyNotesSource", () => {
  it("contributes nothing while core Daily notes is disabled", async () => {
    expect(await readWith({ folder: "Daily" }, false)).toEqual({ kind: "absent" });
  });

  it("reads a configured daily note setup", async () => {
    expect(
      await readWith({ folder: "Daily/", format: "DD-MM-YYYY", template: "Templates/Day", autorun: true }),
    ).toEqual({
      kind: "read",
      reading: {
        source: "daily-notes",
        configured: true,
        journals: [
          {
            source: "daily-notes",
            period: "day",
            folder: "Daily",
            format: "DD-MM-YYYY",
            templates: ["Templates/Day"],
            openAtStartup: false,
          },
        ],
      },
    });
  });

  it("marks untouched default settings as not configured", async () => {
    const read = await readWith({});

    expect(read.kind === "read" && read.reading.configured).toBe(false);
  });
});
