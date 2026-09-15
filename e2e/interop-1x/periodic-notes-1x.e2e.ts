import { browser, expect } from "@wdio/globals";

// Runs only under the Periodic Notes 1.x capability. Its first job is to prove the capability
// itself: the beta installs, loads, and exposes settings as a Svelte store the import unwraps.
describe("periodic notes 1.x interop", () => {
  before(async () => {
    await browser.reloadObsidian({ vault: "./e2e/fixtures/e2e-import-pn1", plugins: ["journals", "periodic-notes"] });
  });

  it("loads Periodic Notes 1.x with its calendar sets behind a store", async () => {
    const sets = await browser.executeObsidian(({ app }) => {
      const plugin = (app as unknown as { plugins: { getPlugin(id: string): unknown } }).plugins.getPlugin(
        "periodic-notes",
      ) as { settings?: { subscribe?: (run: (value: unknown) => void) => () => void } } | null;
      const subscribe = plugin?.settings?.subscribe;
      if (typeof subscribe !== "function") return null;
      let value: unknown;
      subscribe((next) => {
        value = next;
      })();
      return ((value as { calendarSets?: { id: string }[] }).calendarSets ?? []).map((set) => set.id);
    });

    expect(sets).toEqual(["Default"]);
  });
});
