import { browser, expect } from "@wdio/globals";

import { waitForJournalFrontmatter } from "../support/vault.js";

// The API is the one surface unit tests cannot prove: it is reached through Obsidian's
// plugin registry, and the note it creates only becomes visible to `notesFor` once
// metadataCache has re-parsed the frontmatter. The `e2e-daily` fixture commits exactly one
// journal, named `daily`, whose notes live at `{{date}}.md`.
describe("plugin API", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-daily", plugins: ["journals"] });
  });

  it("is reachable at the documented registry path", async () => {
    const version = await browser.waitUntil(
      async () => {
        // executeObsidian serializes undefined as null over the wire, so guard both or a
        // not-yet-assigned api throws out of waitUntil instead of retrying.
        const value = await browser.executeObsidian(({ app }) => {
          const plugins = (app as unknown as { plugins: { plugins: Record<string, { api?: { apiVersion: number } }> } })
            .plugins.plugins;
          return plugins.journals?.api?.apiVersion ?? null;
        });
        return value ?? false;
      },
      { timeout: 10_000, timeoutMsg: "app.plugins.plugins.journals.api never appeared" },
    );

    expect(version).toBe(1);
  });

  it("lists the fixture's journal", async () => {
    const names = await browser.executeObsidian(async ({ app }) => {
      const api = (app as unknown as { plugins: { plugins: Record<string, { api: unknown }> } }).plugins.plugins
        .journals.api as {
        listJournals(selector: { writeType: string }): Promise<{ name: string; write: { type: string } }[]>;
      };
      const journals = await api.listJournals({ writeType: "day" });
      return journals.map((journal) => journal.name);
    });

    expect(names).toEqual(["daily"]);
  });

  it("creates a note through ensureNote and finds it again through notesFor", async () => {
    const created = await browser.executeObsidian(async ({ app }) => {
      const api = (app as unknown as { plugins: { plugins: Record<string, { api: unknown }> } }).plugins.plugins
        .journals.api as {
        ensureNote(
          selector: string,
          date: string,
        ): Promise<{ created: boolean; note: { path: string; date: string; endDate: string } }>;
      };
      const result = await api.ensureNote("daily", "2024-03-07");
      return { path: result.note.path, date: result.note.date, endDate: result.note.endDate, created: result.created };
    });

    expect(created.created).toBe(true);
    expect(created.date).toBe("2024-03-07");
    expect(created.endDate).toBe("2024-03-07");
    expect(created.path).toBe("2024-03-07.md");

    // The write is what makes it a journal note; the index only sees it once Obsidian
    // re-parses the frontmatter, which is the gap this whole spec exists to cross.
    await waitForJournalFrontmatter("2024-03-07.md", { journal: "daily", date: "2024-03-07" });

    const found = await browser.waitUntil(
      async () => {
        const value = await browser.executeObsidian(async ({ app }) => {
          const api = (app as unknown as { plugins: { plugins: Record<string, { api: unknown }> } }).plugins.plugins
            .journals.api as {
            notesFor(selector: string, date: string): Promise<{ path: string | null; file: unknown }[]>;
          };
          const [note] = await api.notesFor("daily", "2024-03-07");
          return note?.file == null ? null : note.path;
        });
        return value ?? false;
      },
      { timeout: 10_000, timeoutMsg: "the created note never appeared in the index" },
    );

    expect(found).toBe("2024-03-07.md");
  });

  it("reports an unknown journal as journal-not-found", async () => {
    const code = await browser.executeObsidian(async ({ app }) => {
      const api = (app as unknown as { plugins: { plugins: Record<string, { api: unknown }> } }).plugins.plugins
        .journals.api as { ensureNote(selector: string, date: string): Promise<unknown> };
      try {
        await api.ensureNote("no-such-journal", "2024-03-07");
        return null;
      } catch (error) {
        return (error as { code?: string }).code ?? null;
      }
    });

    expect(code).toBe("journal-not-found");
  });
});
