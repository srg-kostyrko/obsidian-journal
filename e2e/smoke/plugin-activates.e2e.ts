import { browser, expect } from "@wdio/globals";

// Phase-1 walking skeleton: proves the pipeline (download Obsidian, install the
// freshly built plugin, boot headless, tear down) end to end. It deliberately
// tests no plugin behavior — activation is the only contract here, and the sole
// sanctioned use of plugin-internals introspection (see
// docs/e2e-testing-strategy.md, Authoring conventions).
describe("plugin activation", () => {
  it("enables the journals plugin in a fresh vault", async () => {
    const enabled = await browser.executeObsidian(({ app }) => {
      // `plugins` is part of Obsidian's runtime but not its public typings.
      const runtime = app as unknown as { plugins: { enabledPlugins: Set<string> } };
      return runtime.plugins.enabledPlugins.has("journals");
    });

    expect(enabled).toBe(true);
  });
});
