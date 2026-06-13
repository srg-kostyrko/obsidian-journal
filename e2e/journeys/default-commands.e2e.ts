import { browser, expect } from "@wdio/globals";

import { paletteLists } from "../support/commands.js";

// The fresh-install command seed at the real boundary. The e2e-daily fixture persists a
// journal but no `commands` collection, so at boot the settings service must hit the
// raw===undefined seed path and DynamicCommandRegistry must reconcile the seeded defaults
// into real Obsidian commands. The unit test only proves commandCollection.seed() returns
// valid configs; only here does the fresh-install wiring actually fire. The seeded all/day
// "Open today's note" command is check()-gated on a day-writing journal, which e2e-daily's
// unbounded `daily` journal supplies — so it surfaces in the palette.
describe("default commands", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-daily", plugins: ["journals"] });
  });

  it("seeds the default open-today command into the palette on a fresh install", async () => {
    expect(await paletteLists("Open today's note")).toBe(true);
  });
});
