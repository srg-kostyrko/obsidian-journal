import { browser, expect } from "@wdio/globals";

import { disablePlugin, enablePlugin, isPluginEnabled } from "../support/plugin.js";
import { waitForState } from "../support/wait.js";

const VIEW_TYPE = "journal-view:c0ffee00-0000-4000-8000-000000000001";

const leafCount = async (): Promise<number> =>
  browser.executeObsidian(({ app }, type) => app.workspace.getLeavesOfType(type).length, VIEW_TYPE);

// The startup auto-open seam: ViewHostService.initialize() registers an onLayoutReady callback
// that opens every view with openOnStartup=true. It fires both on a cold boot (when layout
// becomes ready) and on a runtime re-enable (onLayoutReady invokes the callback immediately
// because layout is already ready). Neither path is reachable in the mocked unit suite, which
// cannot have Obsidian drive onLayoutReady for a boot registrant.
describe("view open on startup", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-startup-view", plugins: ["journals"] });
  });

  // Exactly one leaf — guards open()'s dedupe: Obsidian restores registerView-backed leaves
  // from the saved layout before onLayoutReady, so a non-idempotent open would stack a second.
  it("opens exactly one leaf for an opted-in view on launch", async () => {
    await waitForState(leafCount, (count) => count > 0, "view leaf was not opened on startup");
    expect(await leafCount()).toBe(1);
  });

  // Runtime re-enable: layout is already ready, so onLayoutReady fires the open callback
  // synchronously. Disabling first disposes the host and detaches the leaf, so the reopened
  // leaf proves the re-enable path opens the view rather than a stale leaf having survived.
  it("reopens an opted-in view after a disable/enable cycle", async () => {
    await disablePlugin();
    await browser.waitUntil(async () => !(await isPluginEnabled()), { timeoutMsg: "plugin did not disable" });
    await waitForState(leafCount, (count) => count === 0, "view leaf was not detached on disable");

    await enablePlugin();
    await browser.waitUntil(async () => isPluginEnabled(), { timeoutMsg: "plugin did not re-enable" });

    await waitForState(leafCount, (count) => count > 0, "view leaf was not reopened on re-enable");
    expect(await leafCount()).toBe(1);
  });
});
