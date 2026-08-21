import { browser, expect } from "@wdio/globals";

// Every command below is registered from its service's *constructor*, which only runs because the
// service is eager and `autoLoad()` constructs it. That makes the set an observable of the DI
// module graph rather than of any feature: a module split that drops a startup registration, or a
// module that stops being composed into the plugin's own, removes commands here while leaving the
// whole unit suite green — the fake Obsidian has no command registry to lose them from.
//
// Asserted against an EMPTY vault on purpose. `check()` gates whether the palette *lists* a
// command, not whether it is registered, so a vault with no journals still proves registration
// happened. That keeps this a wiring assertion rather than a re-test of the palette behavior
// already covered by the commands journey.
const STATIC_COMMANDS = [
  "journals:connect-note",
  "journals:insert-date-link",
  "journals:open-next",
  "journals:open-prev",
];

async function registeredCommandIds(): Promise<string[]> {
  return browser.executeObsidian(({ app }) => {
    const runtime = app as unknown as { commands: { commands: Record<string, unknown> } };
    return Object.keys(runtime.commands.commands);
  });
}

describe("boot registrations", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-empty", plugins: ["journals"] });
  });

  it("registers every static command at boot", async () => {
    const ids = await registeredCommandIds();

    expect(STATIC_COMMANDS.filter((id) => !ids.includes(id))).toEqual([]);
  });
});
