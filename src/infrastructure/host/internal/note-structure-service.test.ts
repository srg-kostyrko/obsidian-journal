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
        { task: " ", position: pos(3), parent: 3 },
        { position: pos(4), parent: 4 },
        // A wrapped/continued checkbox line: start and end land on different lines,
        // which is what distinguishes this positioned read from the flattened one.
        { task: "x", position: pos(5, 6), parent: 5 },
      ],
      tags: [{ tag: "#task", position: pos(3) }],
      frontmatter: { tags: ["daily"] },
    });

    const structure = service.get(path);
    expect(structure.isSome()).toBe(true);
    const value = structure.isSome() ? structure.value : null;
    expect(value?.listItems).toEqual([
      { marker: " ", line: 3, endLine: 3 },
      { marker: "x", line: 5, endLine: 6 },
    ]);
    expect(value?.tags).toEqual([{ tag: "#task", line: 3 }]);
    expect(value?.headings).toEqual([{ heading: "Tasks", level: 2, line: 2 }]);
    expect(value?.frontmatterTags).toEqual(["#daily"]);
  });
});
