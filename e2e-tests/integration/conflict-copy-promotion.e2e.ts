import { browser, expect } from "@wdio/globals";

interface RecordedEvent {
  readonly path: string;
  readonly reason: string;
  readonly canonical: boolean;
}

interface RecordingWindow extends Window {
  __journalsNoteAdded?: RecordedEvent[];
}

interface FoundNote {
  readonly path: string | null;
  readonly exists: boolean;
}

const PAIR = ["2024-06-10.md", "2024-06-10 (conflict).md"];

async function notesOnDate(): Promise<FoundNote[]> {
  return await browser.executeObsidian(async ({ app }) => {
    const api = (app as unknown as { plugins: { plugins: Record<string, { api: unknown }> } }).plugins.plugins.journals
      .api as {
      notesFor(selector: string, date: string): Promise<{ path: string | null; file: unknown }[]>;
    };
    const notes = await api.notesFor("daily", "2024-06-10");
    return notes.map((note) => ({ path: note.path, exists: note.file !== null }));
  });
}

// The fixture ships one date twice, as a sync conflict leaves it. Which copy the boot walk makes
// the date's owner depends on the walk order, so the spec deletes whichever one owns it and expects
// the other to take the date over — before the fix it stayed unreachable by date until a rescan.
describe("conflict copy promotion", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e-tests/fixtures/e2e-conflict-copy", plugins: ["journals"] });
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

  it("resolves the date to the remaining copy once its owner is deleted", async () => {
    const owner = await browser.waitUntil(
      async () => {
        const [note] = await notesOnDate();
        if (!note?.exists) return false;
        return note.path ?? false;
      },
      { timeout: 10_000, timeoutMsg: "the fixture's date never resolved to a note" },
    );
    expect(PAIR).toContain(owner);
    const remaining = PAIR.find((path) => path !== owner);

    await browser.executeObsidian(async ({ app }, target) => {
      const file = app.vault.getFileByPath(target);
      if (file) await app.vault.delete(file);
    }, owner);

    await browser.waitUntil(
      async () => {
        const [note] = await notesOnDate();
        if (!note?.exists) return false;
        return note.path === remaining;
      },
      { timeout: 10_000, timeoutMsg: "the remaining copy never took the date over" },
    );
    const announced = await browser.execute(
      (target) =>
        ((window as RecordingWindow).__journalsNoteAdded ?? []).filter(
          (event) => event.path === target && event.canonical,
        ),
      remaining ?? "",
    );
    // Filtered to canonical: the boot walk may still be announcing the copy as a loser after the
    // subscription went live.
    expect(announced).toEqual([{ path: remaining, reason: "changed", canonical: true }]);
  });
});
