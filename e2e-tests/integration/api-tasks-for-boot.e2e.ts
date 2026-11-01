import { browser, expect } from "@wdio/globals";

interface FoundTask {
  readonly path: string;
  readonly text: string;
  readonly dates: Record<string, string>;
}

// A dated line in a note no journal owns is reached only by its date, and its date exists only once
// the checkbox walk has read the note. The backlog notes ahead of it keep that walk running past
// boot, so a call made the moment the vault is up answers mid-walk unless tasksFor waits it out.
describe("plugin API tasksFor at boot", () => {
  it("answers a call made right after boot with the dated line from a project note", async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-tasks-boot", plugins: ["journals"] });

    const found = await browser.executeObsidian(async ({ app }) => {
      const api = (app as unknown as { plugins: { plugins: Record<string, { api: unknown }> } }).plugins.plugins
        .journals.api as { tasksFor(selector: string, date: string): Promise<FoundTask[]> };
      const tasks = await api.tasksFor("daily", "2026-10-24");
      return tasks.map(({ path, text, dates }) => ({ path, text, dates }));
    });

    expect(found).toEqual([
      { path: "projects/launch.md", text: "- [ ] Ship the launch 📅 2026-10-24", dates: { due: "2026-10-24" } },
    ]);
  });
});
