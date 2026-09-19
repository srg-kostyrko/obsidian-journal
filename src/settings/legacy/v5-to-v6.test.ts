import { describe, expect, it } from "vitest";

import { v5ToV6Migration } from "./v5-to-v6";

const lines = [[{ template: "{{date:D}}", link: "self", linkDate: "" }]];

function journalWithNavBlock(block: Record<string, unknown>): Record<string, unknown> {
  return { journals: { daily: { name: "daily", navBlock: block } } };
}

function migratedNavBlock(raw: Record<string, unknown>): Record<string, unknown> {
  const out = v5ToV6Migration.migrate(raw) as { journals: { daily: { navBlock: Record<string, unknown> } } };
  return out.journals.daily.navBlock;
}

describe("v5ToV6Migration", () => {
  it.each([
    [true, "all"],
    [false, "none"],
  ])("turns a stored showAdjacent %s into %s", (stored, expected) => {
    const block = migratedNavBlock(
      journalWithNavBlock({ type: "create", decorateWholeBlock: false, lines, showAdjacent: stored }),
    );
    expect(block.showAdjacent).toBe(expected);
  });

  it("shows the adjacent periods everywhere for a block stored before the option existed", () => {
    const block = migratedNavBlock(journalWithNavBlock({ type: "create", decorateWholeBlock: false, lines }));
    expect(block.showAdjacent).toBe("all");
  });

  it("leaves every other key of the block untouched", () => {
    const block = migratedNavBlock(
      journalWithNavBlock({ type: "existing", decorateWholeBlock: true, lines, showAdjacent: false }),
    );
    expect(block).toEqual({ type: "existing", decorateWholeBlock: true, lines, showAdjacent: "none" });
  });

  it("migrates intervalBlock as well as navBlock", () => {
    const raw = {
      journals: {
        sprint: {
          name: "sprint",
          navBlock: { type: "create", decorateWholeBlock: false, lines: [], showAdjacent: false },
          intervalBlock: { type: "create", decorateWholeBlock: true, lines: [], showAdjacent: true },
        },
      },
    };
    const out = v5ToV6Migration.migrate(raw) as {
      journals: { sprint: { navBlock: { showAdjacent: unknown }; intervalBlock: { showAdjacent: unknown } } };
    };
    expect(out.journals.sprint.navBlock.showAdjacent).toBe("none");
    expect(out.journals.sprint.intervalBlock.showAdjacent).toBe("all");
  });

  it("leaves a journal with no blocks untouched", () => {
    const raw = { journals: { bare: { name: "bare" } } };
    expect(v5ToV6Migration.migrate(raw)).toEqual({ journals: { bare: { name: "bare" } } });
  });

  it("skips a null journal entry instead of throwing", () => {
    const raw = { journals: { daily: null } };
    expect(() => v5ToV6Migration.migrate(raw)).not.toThrow();
  });
});
