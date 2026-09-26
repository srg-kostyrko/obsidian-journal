import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";

import { NoteStructureService } from "./note-structure-service";
import { createFakeHost, type FakeHost } from "./testing";
import { InternalObsidianAppToken } from "./tokens";

import type { VaultPath } from "../types";

function build(): { service: NoteStructureService; host: FakeHost } {
  const host = createFakeHost();
  const c = new Container();
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.register(NoteStructureService).useClass(NoteStructureService);
  return { service: c.resolve(NoteStructureService), host };
}

function pos(line: number, endLine = line) {
  return { start: { line, col: 0, offset: 0 }, end: { line: endLine, col: 0, offset: 0 } };
}

describe("NoteStructureService", () => {
  it("returns None for a path that does not exist", () => {
    const { service } = build();
    expect(service.get("nope.md" as VaultPath).isNone()).toBe(true);
  });

  it("keeps task markers, tag lines, heading levels and frontmatter tags", () => {
    const { service, host } = build();
    const path = "day.md" as VaultPath;
    host.putFile(path);
    host.emitMetadata(path, {
      headings: [{ heading: "Tasks", level: 2, position: pos(2) }],
      listItems: [
        // Obsidian roots every item of a list at the negative line number the list starts on, so a
        // contiguous 3-to-5 list gives all three -3. A positive value here would model a shape the
        // host never emits, and certify a parent link that cannot occur.
        { task: " ", position: pos(3), parent: -3 },
        { position: pos(4), parent: -3 },
        // A wrapped/continued checkbox line: start and end land on different lines,
        // which is what distinguishes this positioned read from the flattened one.
        { task: "x", position: pos(5, 6), parent: -3 },
      ],
      tags: [{ tag: "#task", position: pos(3) }],
      frontmatter: { tags: ["daily"] },
    });

    const structure = service.get(path);
    expect(structure.isSome()).toBe(true);
    const value = structure.isSome() ? structure.value : null;
    expect(value?.listItems).toEqual([
      { marker: " ", line: 3, endLine: 3, parent: null },
      { marker: "x", line: 5, endLine: 6, parent: null },
    ]);
    expect(value?.tags).toEqual([{ tag: "#task", line: 3 }]);
    expect(value?.headings).toEqual([{ heading: "Tasks", level: 2, line: 2 }]);
    expect(value?.frontmatterTags).toEqual(["#daily"]);
  });

  // getAllTags concatenates frontmatter and inline tags without deduping, so subtracting the inline
  // ones by value takes the frontmatter occurrence with them — and a note-level tag stops counting
  // for every item in the note the moment the same tag is also written on a line. Disjoint tags,
  // which is what the fixture above uses, cannot see it.
  it("keeps a nested item's parent line and reads Obsidian's negative root marker as no parent", () => {
    const { service, host } = build();
    const path = "day.md" as VaultPath;
    host.putFile(path);
    host.emitMetadata(path, {
      listItems: [
        // Obsidian roots every item of a list at the negative line number the list starts on, so a
        // contiguous 3-to-5 list gives all three -3. A positive value here would model a shape the
        // host never emits, and certify a parent link that cannot occur.
        { task: " ", position: pos(3), parent: -3 },
        { task: " ", position: pos(4), parent: 3 },
      ],
    });

    const structure = service.get(path);
    const value = structure.isSome() ? structure.value : null;
    expect(value?.listItems).toEqual([
      { marker: " ", line: 3, endLine: 3, parent: null },
      { marker: " ", line: 4, endLine: 4, parent: 3 },
    ]);
  });

  it("normalizes the root marker at line 0 without letting a list item become its own parent", () => {
    const { service, host } = build();
    const path = "day.md" as VaultPath;
    host.putFile(path);
    host.emitMetadata(path, {
      listItems: [
        { task: " ", position: pos(0), parent: -0 },
        { task: " ", position: pos(4), parent: -4 },
        { task: " ", position: pos(5), parent: 4 },
      ],
    });

    const structure = service.get(path);
    const value = structure.isSome() ? structure.value : null;
    expect(value?.listItems).toEqual([
      { marker: " ", line: 0, endLine: 0, parent: null },
      { marker: " ", line: 4, endLine: 4, parent: null },
      { marker: " ", line: 5, endLine: 5, parent: 4 },
    ]);
  });

  it("keeps a frontmatter tag that also appears inline", () => {
    const { service, host } = build();
    const path = "day.md" as VaultPath;
    host.putFile(path);
    host.emitMetadata(path, {
      listItems: [{ task: " ", position: pos(3), parent: -3 }],
      tags: [{ tag: "#task", position: pos(3) }],
      frontmatter: { tags: ["task", "daily"] },
    });

    const structure = service.get(path);
    const value = structure.isSome() ? structure.value : null;
    expect(value?.frontmatterTags).toEqual(["#task", "#daily"]);
  });
});
