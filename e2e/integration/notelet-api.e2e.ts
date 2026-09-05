import { browser, expect } from "@wdio/globals";

import { activeNotePath, noteExists, todayAnchor, waitForActiveNote } from "../support/vault.js";

// The notelet half of the plugin API. Like the rest of the API it is reachable only through
// Obsidian's plugin registry, and a notelet it creates becomes visible to noteletsFor only once
// metadataCache has re-parsed the frontmatter — neither of which the unit suite reaches. The
// e2e-notelets fixture's `daily` journal owns a counted **Meeting** type and an uncounted
// **Retro** one.

interface NoteletShape {
  journal: string;
  type: string;
  date: string;
  endDate: string;
  path: string;
  counter: number | null;
}

interface NoteletApi {
  apiVersion: number;
  listJournals(selector: string): Promise<{ name: string; notelets: readonly string[] }[]>;
  noteletOf(file: unknown): Promise<NoteletShape | null>;
  noteletsFor(selector: string, date: string, options?: { type?: string }): Promise<NoteletShape[]>;
  createNotelet(selector: string, date: string, type: string, options?: { openMode?: string }): Promise<NoteletShape>;
  openNotelet(notelet: NoteletShape): Promise<void>;
  on(event: string, handler: (payload: unknown) => void): () => void;
}

// A notelet carries a TFile, which cannot cross the WebDriver wire — every assertion reads the
// plain fields instead.
function plain(notelet: NoteletShape | null): NoteletShape | null {
  return (
    notelet && {
      journal: notelet.journal,
      type: notelet.type,
      date: notelet.date,
      endDate: notelet.endDate,
      path: notelet.path,
      counter: notelet.counter,
    }
  );
}

describe("plugin API — notelets", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-notelets", plugins: ["journals"] });
    await browser.waitUntil(
      async () => {
        const version = await browser.executeObsidian(({ app }) => {
          const plugins = (app as unknown as { plugins: { plugins: Record<string, { api?: { apiVersion: number } }> } })
            .plugins.plugins;
          return plugins.journals?.api?.apiVersion ?? null;
        });
        return version === 1;
      },
      { timeout: 10_000, timeoutMsg: "the journals API never appeared on the plugin registry" },
    );
  });

  it("reports a journal's notelet type names on the journal it lists", async () => {
    const names = await browser.executeObsidian(async ({ app }) => {
      const journals = await (
        app as unknown as { plugins: { plugins: Record<string, { api: NoteletApi }> } }
      ).plugins.plugins.journals.api.listJournals("daily");
      return [...(journals[0]?.notelets ?? [])];
    });

    expect(names).toEqual(["Meeting", "Retro"]);
  });

  // The API's default is create-without-opening — the opposite of every in-app caller's — so a
  // regression to the UI default would silently steal the user's pane.
  it("creates a notelet without opening it, and reports its assigned counter", async () => {
    const before = await activeNotePath();

    const created = await browser.executeObsidian(async ({ app }) => {
      const api = (app as unknown as { plugins: { plugins: Record<string, { api: NoteletApi }> } }).plugins.plugins
        .journals.api;
      const notelet = await api.createNotelet("daily", "today", "Meeting");
      return {
        journal: notelet.journal,
        type: notelet.type,
        date: notelet.date,
        endDate: notelet.endDate,
        path: notelet.path,
        counter: notelet.counter,
      };
    });

    const today = todayAnchor();
    expect(created.journal).toBe("daily");
    expect(created.type).toBe("Meeting");
    expect(created.date).toBe(today);
    expect(created.endDate).toBe(today);
    expect(created.counter).toBe(1);
    expect(await noteExists(created.path)).toBe(true);
    expect(await activeNotePath()).toBe(before);
  });

  it("resolves the notelet a file holds through noteletOf, and nothing for a plain note", async () => {
    const path = await browser.executeObsidian(async ({ app }) => {
      const api = (app as unknown as { plugins: { plugins: Record<string, { api: NoteletApi }> } }).plugins.plugins
        .journals.api;
      const created = await api.createNotelet("daily", "today", "Retro");
      return created.path;
    });

    // noteletOf answers from JournalsIndex, which is filled from metadataCache — so a note
    // created a moment ago is legitimately unresolvable until the cache has re-parsed it.
    let resolved: NoteletShape | null = null;
    await browser.waitUntil(
      async () => {
        resolved = await browser.executeObsidian(async ({ app }, notePath) => {
          const api = (app as unknown as { plugins: { plugins: Record<string, { api: NoteletApi }> } }).plugins.plugins
            .journals.api;
          const notelet = await api.noteletOf(app.vault.getAbstractFileByPath(notePath));
          return notelet === null
            ? null
            : {
                journal: notelet.journal,
                type: notelet.type,
                date: notelet.date,
                endDate: notelet.endDate,
                path: notelet.path,
                counter: notelet.counter,
              };
        }, path);
        return resolved !== null;
      },
      { timeout: 10_000, timeoutMsg: "noteletOf never resolved the freshly created notelet" },
    );

    const notelet = plain(resolved);
    expect(notelet?.type).toBe("Retro");
    // Retro's counter is off, so the field is null rather than a number.
    expect(notelet?.counter).toBeNull();

    const forPlainNote = await browser.executeObsidian(async ({ app }) => {
      const api = (app as unknown as { plugins: { plugins: Record<string, { api: NoteletApi }> } }).plugins.plugins
        .journals.api;
      await app.vault.create("api-plain.md", "nothing here\n");
      return api.noteletOf(app.vault.getAbstractFileByPath("api-plain.md"));
    });
    expect(forPlainNote).toBeNull();
  });

  it("lists the period's notelets and narrows them by type", async () => {
    const listed = await browser.executeObsidian(async ({ app }) => {
      const api = (app as unknown as { plugins: { plugins: Record<string, { api: NoteletApi }> } }).plugins.plugins
        .journals.api;
      const all = await api.noteletsFor("daily", "today");
      const typed = await api.noteletsFor("daily", "today", { type: "Retro" });
      return { all: all.map((notelet) => notelet.type), typed: typed.map((notelet) => notelet.type) };
    });

    // Meeting and Retro were both created above, in this boot.
    expect(listed.all).toHaveLength(2);
    expect(listed.all).toContain("Meeting");
    expect(listed.all).toContain("Retro");
    expect(listed.typed).toEqual(["Retro"]);
  });

  it("opens a notelet through openNotelet", async () => {
    const path = await browser.executeObsidian(async ({ app }) => {
      const api = (app as unknown as { plugins: { plugins: Record<string, { api: NoteletApi }> } }).plugins.plugins
        .journals.api;
      const [notelet] = await api.noteletsFor("daily", "today", { type: "Meeting" });
      if (notelet === undefined) return "";
      await api.openNotelet(notelet);
      return notelet.path;
    });

    await waitForActiveNote(path);
  });

  it("emits noteletAdded when one is created", async () => {
    const event = await browser.executeObsidian(async ({ app }) => {
      const api = (app as unknown as { plugins: { plugins: Record<string, { api: NoteletApi }> } }).plugins.plugins
        .journals.api;
      return new Promise<{ journal: string; type: string; date: string; path: string } | null>((resolve) => {
        const off = api.on("noteletAdded", (payload) => {
          off();
          resolve(payload as { journal: string; type: string; date: string; path: string });
        });
        void api.createNotelet("daily", "today", "Meeting");
        setTimeout(() => {
          off();
          resolve(null);
        }, 8000);
      });
    });

    expect(event?.journal).toBe("daily");
    expect(event?.type).toBe("Meeting");
    expect(event?.date).toBe(todayAnchor());
  });

  it("answers notelet-type-not-found for a type the journal does not define", async () => {
    const code = await browser.executeObsidian(async ({ app }) => {
      const api = (app as unknown as { plugins: { plugins: Record<string, { api: NoteletApi }> } }).plugins.plugins
        .journals.api;
      try {
        await api.createNotelet("daily", "today", "Nope");
        return null;
      } catch (error) {
        return (error as { code?: string }).code ?? null;
      }
    });

    expect(code).toBe("notelet-type-not-found");
  });
});
