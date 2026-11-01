import { browser, expect } from "@wdio/globals";

import { disablePlugin } from "../support/plugin.js";

interface FoundTask {
  readonly path: string;
  readonly text: string;
  readonly dates: Record<string, string>;
}

const PROJECT = "projects/launch.md";

// A dated line in a note no journal owns is reached only by its date, and its date exists only once
// the checkbox walk has read the note. A real walk over a small vault ends before any caller can
// ask, so the read of the project note is held open: the plugin is re-enabled with that read slowed
// and asked straight away, which is a call landing mid-walk.
describe("plugin API tasksFor while the checkbox walk is still reading", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-tasks-boot", plugins: ["journals"] });
    await disablePlugin();
  });

  it("waits for the walk, and answers with the dated line from a project note", async () => {
    const found = await browser.executeObsidian(async ({ app }, project) => {
      const vault = app.vault as unknown as { cachedRead(file: { path: string }): Promise<string> };
      const read = vault.cachedRead.bind(vault);
      vault.cachedRead = async (file) => {
        if (file.path === project) await new Promise((resolve) => window.setTimeout(resolve, 2000));
        return read(file);
      };
      try {
        const plugins = (
          app as unknown as {
            plugins: { enablePlugin(id: string): Promise<void>; plugins: Record<string, { api: unknown }> };
          }
        ).plugins;
        await plugins.enablePlugin("journals");
        const api = plugins.plugins.journals.api as {
          tasksFor(selector: string, date: string): Promise<FoundTask[]>;
        };
        const tasks = await api.tasksFor("daily", "2026-10-24");
        return tasks.map(({ path, text, dates }) => ({ path, text, dates }));
      } finally {
        vault.cachedRead = read;
      }
    }, PROJECT);

    expect(found).toEqual([
      { path: PROJECT, text: "- [ ] Ship the launch 📅 2026-10-24", dates: { due: "2026-10-24" } },
    ]);
  });
});
