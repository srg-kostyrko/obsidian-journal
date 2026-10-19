import { browser, expect } from "@wdio/globals";

import { waitForJournalFrontmatter } from "../support/vault.js";

interface RecordedEvent {
  readonly path: string;
  readonly reason: string;
  readonly canonical: boolean;
}

interface RecordingWindow extends Window {
  __journalsNoteAdded?: RecordedEvent[];
}

function eventsFor(path: string): Promise<RecordedEvent[]> {
  return browser.execute(
    (target) => ((window as RecordingWindow).__journalsNoteAdded ?? []).filter((event) => event.path === target),
    path,
  );
}

// "created" rests on host timing the fake cannot model: ensureNote registers the entry from the
// frontmatter it wrote, and that must land before Obsidian's own metadata parse reports the file,
// or the event reads "appeared" and a consumer writing only on "created" never fires.
describe("plugin API event reasons", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-daily", plugins: ["journals"] });
    await browser.executeObsidian(({ app }) => {
      const api = (app as unknown as { plugins: { plugins: Record<string, { api: unknown }> } }).plugins.plugins
        .journals.api as {
        on(event: "noteAdded", handler: (event: RecordedEvent) => void): () => void;
      };
      const seen: RecordedEvent[] = [];
      const win = window as RecordingWindow;
      win.__journalsNoteAdded = seen;
      api.on("noteAdded", ({ path, reason, canonical }) => {
        seen.push({ path, reason, canonical });
      });
    });
  });

  it("reports a note ensureNote creates as created, once, after Obsidian has parsed it", async () => {
    const path = await browser.executeObsidian(async ({ app }) => {
      const api = (app as unknown as { plugins: { plugins: Record<string, { api: unknown }> } }).plugins.plugins
        .journals.api as {
        ensureNote(selector: string, date: string): Promise<{ created: boolean; note: { path: string } }>;
      };
      const result = await api.ensureNote("daily", "2024-06-11");
      return result.note.path;
    });

    await waitForJournalFrontmatter(path, { journal: "daily", date: "2024-06-11" });

    expect(await eventsFor(path)).toEqual([{ path, reason: "created", canonical: true }]);
  });

  it("reports a claimed note written straight to the vault as appeared", async () => {
    const path = "2024-06-12.md";
    await browser.executeObsidian(async ({ app }, target) => {
      await app.vault.create(target, "---\njournal: daily\njournal-date: 2024-06-12\n---\n");
    }, path);

    await waitForJournalFrontmatter(path, { journal: "daily", date: "2024-06-12" });

    await browser.waitUntil(
      async () => {
        const events = await eventsFor(path);
        return events.length > 0;
      },
      {
        timeout: 10_000,
        timeoutMsg: "the vault-created note never reached noteAdded",
      },
    );
    expect(await eventsFor(path)).toEqual([{ path, reason: "appeared", canonical: true }]);
  });
});
