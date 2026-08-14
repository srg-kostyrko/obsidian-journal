import { browser } from "@wdio/globals";

import { paletteLists } from "../support/commands.js";
import { disablePlugin, enablePlugin, isPluginEnabled } from "../support/plugin.js";

// Disabling disposes the DI container (timers, watchers, registered commands/views); re-enabling
// runs onload again. A clean second boot must re-register the dynamic commands — if disposal leaked
// a binding or onload double-registered, the palette query is the observable that catches it. The
// "Editable command" lives in the e2e-journeys fixture and is unconditionally available.
const COMMAND = "Editable command";

describe("plugin re-enable", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-journeys", plugins: ["journals"] });
  });

  it("re-registers its commands after a disable/enable cycle", async () => {
    await disablePlugin();
    await browser.waitUntil(async () => !(await isPluginEnabled()), {
      timeoutMsg: "plugin did not disable",
    });

    // While disabled, Obsidian unregisters the plugin's commands, so the palette must not list it —
    // this is what makes the post-enable presence a genuine re-registration proof, not a no-op.
    await browser.waitUntil(async () => !(await paletteLists(COMMAND)), {
      timeoutMsg: "command was still listed while the plugin was disabled",
    });

    await enablePlugin();
    await browser.waitUntil(async () => isPluginEnabled(), {
      timeoutMsg: "plugin did not re-enable",
    });

    await browser.waitUntil(async () => paletteLists(COMMAND), {
      timeoutMsg: "commands were not re-registered after re-enable",
    });
  });
});
