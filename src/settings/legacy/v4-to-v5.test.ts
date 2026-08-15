import { describe, expect, it } from "vitest";

import { v4ToV5Migration } from "./v4-to-v5";

function journalWithRows(rows: unknown[]): Record<string, unknown> {
  return { journals: { daily: { name: "daily", navBlock: { type: "create", decorateWholeBlock: false, rows } } } };
}

describe("v4ToV5Migration", () => {
  it("turns each row into a one-segment line", () => {
    const raw = journalWithRows([
      { template: "a", link: "none" },
      { template: "b", link: "week" },
    ]);
    const out = v4ToV5Migration.migrate(raw) as {
      journals: { daily: { navBlock: { lines: { template: string }[][] } } };
    };
    expect(out.journals.daily.navBlock.lines).toEqual([
      [{ template: "a", link: "none", linkDate: "" }],
      [{ template: "b", link: "week", linkDate: "" }],
    ]);
  });

  it("drops the rows key", () => {
    const raw = journalWithRows([{ template: "a" }]);
    const out = v4ToV5Migration.migrate(raw) as { journals: { daily: { navBlock: Record<string, unknown> } } };
    expect("rows" in out.journals.daily.navBlock).toBe(false);
  });

  it("migrates intervalBlock as well as navBlock", () => {
    const raw = {
      journals: {
        sprint: {
          name: "sprint",
          navBlock: { type: "create", decorateWholeBlock: false, rows: [] },
          intervalBlock: { type: "create", decorateWholeBlock: true, rows: [{ template: "x" }] },
        },
      },
    };
    const out = v4ToV5Migration.migrate(raw) as {
      journals: { sprint: { intervalBlock: { lines: unknown[][] } } };
    };
    expect(out.journals.sprint.intervalBlock.lines).toEqual([[{ template: "x", linkDate: "" }]]);
  });

  it("leaves a journal with no blocks untouched", () => {
    const raw = { journals: { bare: { name: "bare" } } };
    expect(() => v4ToV5Migration.migrate(raw)).not.toThrow();
  });
});
