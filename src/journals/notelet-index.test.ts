import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";

import { NoteletIndex } from "./notelet-index";

import type { NoteletEntry } from "./types";

const a = (s: string) => s as AnchorString;
const p = (s: string) => s as VaultPath;
const notelet = (anchor: string, path: string, typeName: string): NoteletEntry => ({
  kind: "notelet",
  journalName: "daily",
  anchor: a(anchor),
  path: p(path),
  typeName,
  typeId: null,
});

describe("NoteletIndex", () => {
  it("keeps several notelets at one anchor", () => {
    const index = new NoteletIndex();
    index.add(notelet("2026-01-01", "a.md", "Standup"));
    index.add(notelet("2026-01-01", "b.md", "Standup"));

    expect([...index.atAnchor(a("2026-01-01"))]).toEqual([p("a.md"), p("b.md")]);
  });

  it("groups by the stored type name", () => {
    const index = new NoteletIndex();
    index.add(notelet("2026-01-01", "a.md", "Standup"));
    index.add(notelet("2026-01-02", "b.md", "Standup"));
    index.add(notelet("2026-01-02", "c.md", "Meeting"));

    expect([...index.ofType("Standup")]).toEqual([p("a.md"), p("b.md")]);
  });

  it("removes only the named path from a shared anchor", () => {
    const index = new NoteletIndex();
    const first = notelet("2026-01-01", "a.md", "Standup");
    index.add(first);
    index.add(notelet("2026-01-01", "b.md", "Standup"));

    index.remove(first);

    expect([...index.atAnchor(a("2026-01-01"))]).toEqual([p("b.md")]);
  });

  it("re-adding the same path does not duplicate it", () => {
    const index = new NoteletIndex();
    index.add(notelet("2026-01-01", "a.md", "Standup"));
    index.add(notelet("2026-01-01", "a.md", "Standup"));

    expect([...index.atAnchor(a("2026-01-01"))]).toEqual([p("a.md")]);
  });

  it("moves a path in both projections on transfer", () => {
    const index = new NoteletIndex();
    const entry = notelet("2026-01-01", "a.md", "Standup");
    index.add(entry);

    index.transferPath(entry, p("moved.md"));

    expect([...index.atAnchor(a("2026-01-01"))]).toEqual([p("moved.md")]);
    expect([...index.ofType("Standup")]).toEqual([p("moved.md")]);
  });

  it("re-adding a path under a different type name leaves it only in the new type's bucket", () => {
    const index = new NoteletIndex();
    index.add(notelet("2026-01-01", "a.md", "Standup"));
    index.add(notelet("2026-01-01", "a.md", "Meeting"));

    expect([...index.ofType("Standup")]).toEqual([]);
    expect([...index.ofType("Meeting")]).toEqual([p("a.md")]);
  });

  it("re-adding a path under a different anchor leaves it only at the new anchor", () => {
    const index = new NoteletIndex();
    index.add(notelet("2026-01-01", "a.md", "Standup"));
    index.add(notelet("2026-01-02", "a.md", "Standup"));

    expect([...index.atAnchor(a("2026-01-01"))]).toEqual([]);
    expect([...index.atAnchor(a("2026-01-02"))]).toEqual([p("a.md")]);
  });

  it("removes from the type bucket the path was actually added under, even if the entry's typeName has since changed", () => {
    const index = new NoteletIndex();
    index.add(notelet("2026-01-01", "a.md", "Standup"));

    index.remove(notelet("2026-01-01", "a.md", "Meeting"));

    expect([...index.ofType("Standup")]).toEqual([]);
  });

  describe("paths", () => {
    it("lists every indexed notelet once, across anchors and types", () => {
      const index = new NoteletIndex();
      index.add(notelet("2026-06-01", "a.md", "Standup"));
      index.add(notelet("2026-06-01", "b.md", "Recipe"));
      index.add(notelet("2026-06-02", "c.md", "Standup"));

      expect([...index.paths()].toSorted()).toEqual(["a.md", "b.md", "c.md"]);
    });

    it("drops a removed notelet", () => {
      const index = new NoteletIndex();
      const entry = notelet("2026-01-01", "a.md", "Standup");
      index.add(entry);
      index.remove(entry);

      expect(index.paths()).toEqual([]);
    });
  });
});
