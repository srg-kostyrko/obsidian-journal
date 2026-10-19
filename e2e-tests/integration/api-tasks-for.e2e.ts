import { browser, expect } from "@wdio/globals";

import { waitForJournalFrontmatter } from "../support/vault.js";

interface FoundTask {
  readonly line: number | null;
  readonly text: string;
  readonly status: string;
  readonly parentLine: number | null;
}

// The fake hands tasksFor pre-hydrated markdown; only a real vault proves the text is read off disk
// and the lines come from Obsidian's own list parse.
describe("plugin API tasksFor", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-daily", plugins: ["journals"] });
  });

  it("lists a real note's open tasks with their text, lines and nesting", async () => {
    await browser.executeObsidian(async ({ app }) => {
      const api = (app as unknown as { plugins: { plugins: Record<string, { api: unknown }> } }).plugins.plugins
        .journals.api as { ensureNote(selector: string, date: string): Promise<{ note: { path: string } }> };
      const { note } = await api.ensureNote("daily", "2024-07-03");
      const file = app.vault.getFileByPath(note.path);
      // A missing file leaves the note without tasks, which the wait below reports by name.
      if (file === null) return;
      await app.vault.process(
        file,
        (content) => `${content}\n- [x] Parent done\n\t- [ ] Child open\n- [ ] Loose end\n`,
      );
    });
    await waitForJournalFrontmatter("2024-07-03.md", { journal: "daily", date: "2024-07-03" });

    let found: FoundTask[] = [];
    await browser.waitUntil(
      async () => {
        found = await browser.executeObsidian(async ({ app }) => {
          const api = (app as unknown as { plugins: { plugins: Record<string, { api: unknown }> } }).plugins.plugins
            .journals.api as { tasksFor(selector: string, date: string): Promise<FoundTask[]> };
          const tasks = await api.tasksFor("daily", "2024-07-03");
          return tasks.map(({ line, text, status, parentLine }) => ({ line, text, status, parentLine }));
        });
        return found.length === 2;
      },
      { timeout: 10_000, timeoutMsg: "tasksFor never listed the note's two open tasks" },
    );

    const lines = await browser.executeObsidian(async ({ app }) => {
      const file = app.vault.getFileByPath("2024-07-03.md");
      if (file === null) return [];
      const content = await app.vault.read(file);
      return content.split("\n");
    });
    const parent = lines.indexOf("- [x] Parent done");
    expect(found).toEqual([
      { line: parent + 1, text: "\t- [ ] Child open", status: "todo", parentLine: parent },
      { line: parent + 2, text: "- [ ] Loose end", status: "todo", parentLine: null },
    ]);
  });
});
