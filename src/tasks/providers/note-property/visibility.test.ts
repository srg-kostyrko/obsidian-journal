import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { VaultPath } from "@/infrastructure/host";

import { buildTaskItem } from "../../testing";

import {
  admits,
  DEFAULT_NOTE_VISIBILITY,
  noteVisibilitySchema,
  referencedProperties,
  type NoteVisibility,
  type VisibilityCondition,
} from "./visibility";

import type { TaskItem } from "../../types";

function noteItem(
  path: string,
  frontmatterTags: string[] = ["#task"],
  properties: Record<string, unknown> = {},
): TaskItem {
  return buildTaskItem({
    provider: "note-property",
    key: `note-property:${path}`,
    path: path as VaultPath,
    relations: ["date"],
    display: { kind: "note", path: path as VaultPath, title: "t" },
    facts: { frontmatterTags, properties },
  });
}

function matching(conditions: VisibilityCondition[], mode: "and" | "or" = "and"): NoteVisibility {
  return { show: "matching", mode, conditions };
}

function rule(name: string, values: string[]): NoteVisibility {
  return matching([{ type: "property", name, values }]);
}

function withProperty(name: string, value: unknown): TaskItem {
  return noteItem("Tasks/a.md", ["#task"], { [name]: value });
}

function tagged(...tags: string[]): TaskItem {
  return noteItem("Work/a.md", tags);
}

describe("admits", () => {
  const item = noteItem("Work/a.md", ["#task", "#Work"]);

  it("admits everything when the journal has no rule, or shows all", () => {
    expect(admits(undefined, item)).toBe(true);
    expect(admits(DEFAULT_NOTE_VISIBILITY, item)).toBe(true);
  });

  it("admits nothing when the journal shows none", () => {
    expect(admits({ show: "none", mode: "and", conditions: [] }, item)).toBe(false);
  });

  it("leaves an item that carries no facts alone, so only task notes are narrowed", () => {
    const line = buildTaskItem();
    expect(admits({ show: "none", mode: "and", conditions: [] }, line)).toBe(true);
    expect(admits(matching([{ type: "tag", tags: ["#work"] }]), line)).toBe(true);
  });

  it("treats matching with no conditions as all, since there is nothing to narrow by", () => {
    expect(admits(matching([]), item)).toBe(true);
  });

  it("matches a tag condition case-insensitively against the frontmatter tags", () => {
    expect(admits(matching([{ type: "tag", tags: ["#work"] }]), item)).toBe(true);
    expect(admits(matching([{ type: "tag", tags: ["#home", "#WORK"] }]), item)).toBe(true);
    expect(admits(matching([{ type: "tag", tags: ["#home"] }]), item)).toBe(false);
  });

  it("matches a nested tag under a condition's tag, as Obsidian's tag search does", () => {
    expect(admits(matching([{ type: "tag", tags: ["#work"] }]), tagged("#Work/Project"))).toBe(true);
    expect(admits(matching([{ type: "tag", tags: ["#work"] }]), tagged("#workshop"))).toBe(false);
    expect(admits(matching([{ type: "tag", tags: ["#work/project"] }]), tagged("#work"))).toBe(false);
  });

  it("skips an empty or root folder entry, so a folder condition never widens to every path", () => {
    const home = noteItem("Home/a.md");
    expect(admits(matching([{ type: "folder", folders: ["", "/", "Work"] }]), home)).toBe(false);
    expect(
      admits(
        matching(
          [
            { type: "folder", folders: ["", "/"] },
            { type: "tag", tags: ["#home"] },
          ],
          "or",
        ),
        home,
      ),
    ).toBe(false);
  });

  it("matches a folder condition as a path prefix, never a name prefix", () => {
    expect(admits(matching([{ type: "folder", folders: ["Work"] }]), noteItem("Work/a.md"))).toBe(true);
    expect(admits(matching([{ type: "folder", folders: ["Work/"] }]), noteItem("Work/sub/a.md"))).toBe(true);
    expect(admits(matching([{ type: "folder", folders: ["Work"] }]), noteItem("Workshop/a.md"))).toBe(false);
    expect(admits(matching([{ type: "folder", folders: ["work"] }]), noteItem("Work/a.md"))).toBe(false);
  });

  describe("property", () => {
    it("matches a scalar case-insensitively", () => {
      expect(admits(rule("context", ["office"]), withProperty("context", "Office"))).toBe(true);
      expect(admits(rule("context", ["home"]), withProperty("context", "Office"))).toBe(false);
    });

    it("matches any item of a list", () => {
      expect(admits(rule("context", ["home"]), withProperty("context", ["office", "Home"]))).toBe(true);
      expect(admits(rule("context", ["car"]), withProperty("context", ["office", "Home"]))).toBe(false);
    });

    it("matches a YAML boolean or number by its text", () => {
      expect(admits(rule("billable", ["true"]), withProperty("billable", true))).toBe(true);
      expect(admits(rule("billable", ["true"]), withProperty("billable", "true"))).toBe(true);
      expect(admits(rule("billable", ["true"]), withProperty("billable", false))).toBe(false);
      expect(admits(rule("priority", ["1"]), withProperty("priority", 1))).toBe(true);
    });

    it("matches an internal link by its target or the target's path", () => {
      expect(admits(rule("projects", ["Website"]), withProperty("projects", ["[[Website]]"]))).toBe(true);
      expect(admits(rule("projects", ["website"]), withProperty("projects", "[[Website]]"))).toBe(true);
      const aliased = withProperty("projects", ["[[Projects/Website|Site]]"]);
      expect(admits(rule("projects", ["Website"]), aliased)).toBe(true);
      expect(admits(rule("projects", ["Projects/Website"]), aliased)).toBe(true);
      expect(admits(rule("projects", ["Site"]), aliased)).toBe(false);
      expect(admits(rule("projects", ["Website"]), withProperty("projects", "[[Projects/Website.md#Plan]]"))).toBe(
        true,
      );
      expect(admits(rule("projects", ["Web"]), withProperty("projects", "[[Website]]"))).toBe(false);
    });

    it("reads a condition value typed as a link, or with its extension, as the link target", () => {
      const aliased = withProperty("projects", ["[[Projects/Website|Site]]"]);
      expect(admits(rule("projects", ["[[Website]]"]), aliased)).toBe(true);
      expect(admits(rule("projects", ["[[Projects/Website|x]]"]), aliased)).toBe(true);
      expect(admits(rule("projects", ["Projects/Website.md"]), aliased)).toBe(true);
      expect(admits(rule("projects", ["[[Shop]]"]), aliased)).toBe(false);
    });

    it("reads the property name exactly", () => {
      expect(admits(rule("Context", ["office"]), withProperty("context", "office"))).toBe(false);
    });

    it("does not match a note without the property", () => {
      expect(admits(rule("context", ["office"]), noteItem("Tasks/a.md"))).toBe(false);
    });
  });

  it("requires every condition under and, any under or", () => {
    const conditions: VisibilityCondition[] = [
      { type: "tag", tags: ["#work"] },
      { type: "folder", folders: ["Home"] },
    ];
    expect(admits(matching(conditions, "and"), item)).toBe(false);
    expect(admits(matching(conditions, "or"), item)).toBe(true);
  });

  it("skips a condition with an empty value list rather than letting it decide", () => {
    const empty: VisibilityCondition = { type: "tag", tags: [] };
    expect(admits(matching([empty, { type: "folder", folders: ["Home"] }], "or"), item)).toBe(false);
    expect(admits(matching([empty, { type: "folder", folders: ["Work"] }], "and"), item)).toBe(true);
    expect(admits(matching([empty]), item)).toBe(true);
  });
});

describe("noteVisibilitySchema", () => {
  it("defaults a rule it cannot read to all", () => {
    expect(v.parse(noteVisibilitySchema, {})).toEqual(DEFAULT_NOTE_VISIBILITY);
    expect(v.parse(noteVisibilitySchema, { show: "weird", mode: 3 })).toEqual(DEFAULT_NOTE_VISIBILITY);
  });

  it("drops a condition of a type this version does not know and keeps the rest", () => {
    const parsed = v.parse(noteVisibilitySchema, {
      show: "matching",
      mode: "or",
      conditions: [{ type: "not-a-real-type" }, { type: "tag", tags: ["#work"] }, "garbage"],
    });
    expect(parsed).toEqual({ show: "matching", mode: "or", conditions: [{ type: "tag", tags: ["#work"] }] });
  });

  it("keeps the readable entries of a value list holding one it cannot read", () => {
    const parsed = v.parse(noteVisibilitySchema, {
      show: "matching",
      conditions: [
        { type: "tag", tags: ["#work", 3] },
        { type: "folder", folders: [null, "Work"] },
        { type: "property", name: "projects", values: ["Website", { x: 1 }] },
      ],
    });
    expect(parsed.conditions).toEqual([
      { type: "tag", tags: ["#work"] },
      { type: "folder", folders: ["Work"] },
      { type: "property", name: "projects", values: ["Website"] },
    ]);
  });

  it("keeps a property condition", () => {
    const condition = { type: "property", name: "projects", values: ["Website"] };
    expect(v.parse(noteVisibilitySchema, { show: "matching", conditions: [condition] }).conditions).toEqual([
      condition,
    ]);
  });
});

describe("referencedProperties", () => {
  it("collects the property names a matching rule reads, and none from a rule that reads none", () => {
    const names = referencedProperties([
      undefined,
      matching([
        { type: "property", name: "projects", values: ["Website"] },
        { type: "tag", tags: ["#work"] },
      ]),
      matching([{ type: "property", name: "context", values: ["office"] }]),
      { show: "all", mode: "and", conditions: [{ type: "property", name: "ignored", values: ["x"] }] },
      matching([{ type: "property", name: "empty", values: [] }]),
    ]);
    expect([...names].toSorted()).toEqual(["context", "projects"]);
  });
});
