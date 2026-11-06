import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { DEFAULT_TASK_QUERY } from "@/tasks/query";

import { tasksCodeBlock } from "./tasks-block";
import { tasksBlockKeys, tasksBlockSchema, toTaskQuery } from "./tasks-config";

// The schema's output mirrors the raw fence keys flatly, the way every other registered fence's
// schema does — `manual-fences.test.ts`'s `degraded()` check does a flat per-key lookup
// (`output[key]`), so a nested output would make it misreport every documented key beyond `sort`
// as "falls back to its default" even when the schema handled it correctly. Desugaring into a
// `TaskQuery` is `toTaskQuery`'s job, not the schema's.
describe("tasksBlockSchema", () => {
  it("defaults a bare fence's flat fields", () => {
    expect(v.parse(tasksBlockSchema, {})).toEqual({
      provider: undefined,
      source: "both",
      depth: "literal",
      status: undefined,
      heading: undefined,
      tag: undefined,
      sort: "document",
      date: "scheduled-or-due",
      conditions: [],
    });
  });

  it("fails a status condition naming a status the status key would not take, rather than matching nothing", () => {
    const misspelled = { conditions: [{ type: "status", condition: "is-not", statuses: ["finished"] }] };
    const result = v.safeParse(tasksBlockSchema, misspelled);
    expect(result.success).toBe(false);
    // The block lists each issue's message, so the misspelled name itself has to be in one.
    expect(result.issues?.map((issue) => issue.message).join("\n")).toContain('"finished"');
    const known = { conditions: [{ type: "status", condition: "is", statuses: ["open", "on-hold"] }] };
    expect(v.safeParse(tasksBlockSchema, known).success).toBe(true);
  });

  it("reports its own keys, in desugar order", () => {
    expect(tasksBlockKeys).toEqual([
      "provider",
      "source",
      "depth",
      "status",
      "heading",
      "tag",
      "sort",
      "date",
      "conditions",
    ]);
  });

  it("reads a known date and rejects one it does not know", () => {
    expect(v.parse(tasksBlockSchema, { date: "due" }).date).toBe("due");
    expect(toTaskQuery(v.parse(tasksBlockSchema, { date: "due" })).date).toBe("due");
    expect(v.safeParse(tasksBlockSchema, { date: "whenever" }).success).toBe(false);
  });

  it("reads a single value written as one thing as a one-item list", () => {
    expect(v.parse(tasksBlockSchema, { tag: "#work" }).tag).toEqual(["#work"]);
    expect(v.parse(tasksBlockSchema, { provider: "checkbox" }).provider).toEqual(["checkbox"]);
  });

  it("keeps a list of values as-is", () => {
    expect(v.parse(tasksBlockSchema, { status: ["done", "cancelled"] }).status).toEqual(["done", "cancelled"]);
  });

  // A fence is typed by hand and read by its author, so a value it does not know is an error to fix
  // rather than a default that quietly lists something else.
  it.each([
    ["source", "nope"],
    ["depth", "nope"],
    ["sort", "priority"],
    ["status", "in progress"],
    ["status", ["open", "nope"]],
    ["tag", { a: 1 }],
    ["heading", null],
    ["tag", []],
    ["conditions", "not-a-list"],
    ["conditions", [{ type: "tag", condition: "lack", tags: ["#w"] }]],
    ["conditions", [{ type: "heading", condition: "below", headings: ["Habits"] }]],
  ] as const)("rejects %s: %j", (key, value) => {
    expect(v.safeParse(tasksBlockSchema, { [key]: value }).success).toBe(false);
  });

  it("rejects a body that is not a mapping of options", () => {
    expect(v.safeParse(tasksBlockSchema, "source:notelets").success).toBe(false);
  });

  it("reads a known source, depth and sort", () => {
    expect(v.parse(tasksBlockSchema, { source: "notelets" }).source).toBe("notelets");
    expect(v.parse(tasksBlockSchema, { depth: "rollup" }).depth).toBe("rollup");
    expect(v.parse(tasksBlockSchema, { sort: "due" }).sort).toBe("due");
  });

  it("reads a status alias or name, and an empty body as the defaults", () => {
    expect(v.parse(tasksBlockSchema, { status: ["open", "in-progress"] }).status).toEqual(["open", "in-progress"]);
    expect(v.parse(tasksBlockSchema, null)).toEqual(v.parse(tasksBlockSchema, {}));
  });

  it("registers the journal-tasks key", () => {
    expect(tasksCodeBlock.keys).toEqual(["journal-tasks"]);
    expect(tasksCodeBlock.cssClass).toEqual(["journal-tasks-code-block"]);
  });
});

describe("toTaskQuery", () => {
  it("defaults a bare fence to both sources and this period, and names no status of its own", () => {
    const query = toTaskQuery(v.parse(tasksBlockSchema, {}));
    expect(query.scope).toEqual(DEFAULT_TASK_QUERY.scope);
    expect(query.sort).toBe(DEFAULT_TASK_QUERY.sort);
    expect(query.filter).toEqual({ mode: "and", conditions: [] });
  });

  it("sets scope.provider/source/depth from the flat fields", () => {
    const parsed = v.parse(tasksBlockSchema, { provider: "checkbox", source: "notelets", depth: "rollup" });
    expect(toTaskQuery(parsed).scope).toEqual({ provider: ["checkbox"], source: "notelets", depth: "rollup" });
  });

  it("desugars each flat key into exactly one condition, status before heading", () => {
    const parsed = v.parse(tasksBlockSchema, { heading: "## Tasks", status: "done" });
    expect(toTaskQuery(parsed).filter.conditions).toEqual([
      { type: "status", condition: "is", statuses: ["done"] },
      { type: "heading", condition: "under", headings: ["## Tasks", "Tasks"] },
    ]);
  });

  it("orders desugared conditions status, then heading, then tag", () => {
    const parsed = v.parse(tasksBlockSchema, { tag: "#work", heading: "## Tasks", status: "done" });
    expect(toTaskQuery(parsed).filter.conditions).toEqual([
      { type: "status", condition: "is", statuses: ["done"] },
      { type: "heading", condition: "under", headings: ["## Tasks", "Tasks"] },
      { type: "tag", condition: "has", tags: ["#work"] },
    ]);
  });

  // headingsOf() (src/tasks/note-structure.ts) compares against Obsidian's own HeadingCache.heading,
  // which never carries the markdown "#" — so `## Tasks`, the spelling a user's own note shows, must
  // also match the heading `Tasks`, or it parses cleanly and matches nothing, silently.
  it("matches a heading written with its ATX # prefix as the bare text too", () => {
    const parsed = v.parse(tasksBlockSchema, { heading: "## Tasks" });
    expect(toTaskQuery(parsed).filter.conditions).toContainEqual({
      type: "heading",
      condition: "under",
      headings: ["## Tasks", "Tasks"],
    });
  });

  // A heading `## # Work` has the text `# Work`; stripping alone would make it unreachable.
  it("keeps a heading as written beside its stripped spelling, so text that starts with '# ' still matches", () => {
    const parsed = v.parse(tasksBlockSchema, {
      heading: "# Work",
      conditions: [{ type: "heading", condition: "not-under", headings: ["# Work"] }],
    });
    expect(toTaskQuery(parsed).filter.conditions).toEqual([
      { type: "heading", condition: "under", headings: ["# Work", "Work"] },
      { type: "heading", condition: "not-under", headings: ["# Work", "Work"] },
    ]);
  });

  // metadataCache tags always carry the leading "#" — the fence must accept the spelling without
  // one too, or a tag named without its "#" (the spelling conditionValues() already accepts on the
  // settings side) matches nothing here.
  it("normalizes a tag written without its # to the same condition as one with it", () => {
    const bare = toTaskQuery(v.parse(tasksBlockSchema, { tag: "work" }));
    const withHash = toTaskQuery(v.parse(tasksBlockSchema, { tag: "#work" }));
    expect(bare.filter.conditions).toEqual(withHash.filter.conditions);
    expect(bare.filter.conditions).toContainEqual({ type: "tag", condition: "has", tags: ["#work"] });
  });

  // The ATX prefix is a run of "#" followed by whitespace; a heading whose own text happens to start
  // with "#" and no following space is not markdown syntax and must survive untouched.
  it("does not strip a heading whose text genuinely starts with #, with no space after it", () => {
    const parsed = v.parse(tasksBlockSchema, { heading: "#1 priority" });
    expect(toTaskQuery(parsed).filter.conditions).toContainEqual({
      type: "heading",
      condition: "under",
      headings: ["#1 priority"],
    });
  });

  it("normalizes every entry of a heading or tag list, not just a lone value", () => {
    const parsed = v.parse(tasksBlockSchema, { heading: ["## Tasks", "# Personal"], tag: ["work", "#home"] });
    expect(toTaskQuery(parsed).filter.conditions).toEqual([
      { type: "heading", condition: "under", headings: ["## Tasks", "Tasks", "# Personal", "Personal"] },
      { type: "tag", condition: "has", tags: ["#work", "#home"] },
    ]);
  });

  // The bare-fence `status: open` default lives in composeFilters (src/tasks/filter.ts), applied
  // after a journal's own filter has been composed in — not emitted here. Emitted here it is a
  // query condition, and replace-by-type then overrides the journal's own status condition on
  // every fence, however bare, so a journal saying "show all statuses" could never reach one.
  it("emits no status condition when the fence wrote no status key, so a journal's own can reach it", () => {
    const parsed = v.parse(tasksBlockSchema, { tag: "#work" });
    expect(toTaskQuery(parsed).filter.conditions).toEqual([{ type: "tag", condition: "has", tags: ["#work"] }]);
  });

  it("desugars a status list", () => {
    const parsed = v.parse(tasksBlockSchema, { status: ["done", "cancelled"] });
    expect(toTaskQuery(parsed).filter.conditions).toEqual([
      { type: "status", condition: "is", statuses: ["done", "cancelled"] },
    ]);
  });

  it("appends the full-form conditions key after every desugared one", () => {
    const parsed = v.parse(tasksBlockSchema, {
      status: "done",
      conditions: [{ type: "tag", condition: "lacks", tags: ["#waiting"] }],
    });
    expect(toTaskQuery(parsed).filter.conditions).toEqual([
      { type: "status", condition: "is", statuses: ["done"] },
      { type: "tag", condition: "lacks", tags: ["#waiting"] },
    ]);
  });

  // #604: a bare tag under `conditions:` matched nothing, so `lacks` silently listed every task.
  it("normalizes the spelling of tags and headings in the full-form conditions key as the flat keys do", () => {
    const parsed = v.parse(tasksBlockSchema, {
      conditions: [
        { type: "tag", condition: "lacks", tags: ["routine", "#home"] },
        { type: "heading", condition: "not-under", headings: ["## Habits", "#1 priority"] },
        { type: "status", condition: "is-not", statuses: ["done"] },
      ],
    });
    expect(toTaskQuery(parsed).filter.conditions).toEqual([
      { type: "tag", condition: "lacks", tags: ["#routine", "#home"] },
      { type: "heading", condition: "not-under", headings: ["## Habits", "Habits", "#1 priority"] },
      { type: "status", condition: "is-not", statuses: ["done"] },
    ]);
  });
});
