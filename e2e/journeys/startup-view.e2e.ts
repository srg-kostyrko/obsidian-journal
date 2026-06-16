import { browser } from "@wdio/globals";

import { waitForState } from "../support/wait.js";

const VIEW_TYPE = "journal-view:c0ffee00-0000-4000-8000-000000000001";

// The startup auto-open seam: ViewHostService.initialize() captures appStartup from
// layoutReady at onload and, on a cold boot (layout not yet ready), opens every view
// with openOnStartup=true on onLayoutReady. A real boot is the only place this runs —
// the mocked unit suite cannot have Obsidian invoke onLayoutReady for a boot registrant.
describe("view open on startup", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-startup-view", plugins: ["journals"] });
  });

  it("opens an opted-in view's leaf on launch", async () => {
    await waitForState(
      async () => browser.executeObsidian(({ app }, type) => app.workspace.getLeavesOfType(type).length, VIEW_TYPE),
      (count) => count > 0,
      "view leaf was not opened on startup",
    );
  });
});
