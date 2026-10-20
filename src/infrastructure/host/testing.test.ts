import { describe, expect, it } from "vitest";

import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { FakeNotesService } from "./testing";

import type { VaultPath } from "./types";

const path = "a.md" as VaultPath;

// TaskIndex.hydrate (src/tasks/task-index.ts) caches a note's lines keyed by mtime and skips the
// re-read when the cached mtime still matches. A fake whose mtime never moves makes that check
// silently correct for the wrong reason: it would serve stale lines after a real edit and no test
// against this fake would ever see it, because nothing here ever disagrees.
describe("FakeNotesService mtime", () => {
  it("advances mtime on write, and again on a second write", async () => {
    const notes = new FakeNotesService();
    expectOk(await notes.create(path, "one"));
    const first = notes.find(path);
    const firstMtime = first.isSome() ? first.value.mtime : null;

    expectOk(await notes.write(path, "two"));
    const second = notes.find(path);
    const secondMtime = second.isSome() ? second.value.mtime : null;

    expectOk(await notes.write(path, "three"));
    const third = notes.find(path);
    const thirdMtime = third.isSome() ? third.value.mtime : null;

    expect(secondMtime).not.toBe(firstMtime);
    expect(thirdMtime).not.toBe(secondMtime);
  });

  it("advances mtime on append and on process, each distinctly", async () => {
    const notes = new FakeNotesService();
    expectOk(await notes.create(path, "one"));
    const created = notes.find(path);
    const createdMtime = created.isSome() ? created.value.mtime : null;

    expectOk(await notes.append(path, "-two"));
    const appended = notes.find(path);
    const appendedMtime = appended.isSome() ? appended.value.mtime : null;

    expectOk(await notes.process(path, (content) => `${content}-three`));
    const processed = notes.find(path);
    const processedMtime = processed.isSome() ? processed.value.mtime : null;

    expect(appendedMtime).not.toBe(createdMtime);
    expect(processedMtime).not.toBe(appendedMtime);
  });

  // The mtime move is not decorative: it is the signal a cache like TaskIndex's re-reads on.
  // This pins the mechanism that signal depends on directly against FakeNotesService, without
  // reaching into TaskIndex — a second read after a write must see the write, and the mtime that
  // moved is what would have told a mtime-keyed cache to take that second read at all.
  it("makes a write's new content visible to a later read, off the mtime that moved", async () => {
    const notes = new FakeNotesService();
    expectOk(await notes.create(path, "before"));
    const before = notes.find(path);
    const beforeMtime = before.isSome() ? before.value.mtime : null;

    expectOk(await notes.write(path, "after"));
    const after = notes.find(path);
    const afterMtime = after.isSome() ? after.value.mtime : null;

    expect(afterMtime).not.toBe(beforeMtime);
    const read = await notes.readCached(path);
    expectOk(read);
    expect(read.value).toBe("after");
  });
});

// processFrontMatter throws out of the mutator before it writes, so the real service answers a
// throwing mutator with a FrontmatterError and leaves the file as it was.
describe("FakeNotesService updateFrontmatter", () => {
  it("answers a throwing mutator with a frontmatter error and writes nothing", async () => {
    const notes = new FakeNotesService();
    notes.seed(path, "", { status: "open" });
    const written: VaultPath[] = [];
    notes.events.on("modified", (target) => written.push(target));
    const reason = new Error("refused");

    const result = await notes.updateFrontmatter(path, (frontmatter) => {
      frontmatter.status = "done";
      throw reason;
    });

    expectErr(result);
    expect(result.error.kind).toBe("frontmatter-failed");
    expect(result.error.kind === "frontmatter-failed" ? result.error.cause : undefined).toBe(reason);
    expect(notes.frontmatterOf(path)).toEqual({ status: "open" });
    expect(written).toEqual([]);
  });
});

describe("FakeNotesService ignore", () => {
  it("ignore() marks a path as user-ignored", () => {
    const notes = new FakeNotesService();
    const target = "Private/diary.md" as VaultPath;
    expect(notes.isUserIgnored(target)).toBe(false);
    notes.ignore(target);
    expect(notes.isUserIgnored(target)).toBe(true);
    expect(notes.isUserIgnored("Other.md" as VaultPath)).toBe(false);
  });

  it("unignore() lifts the mark", () => {
    const notes = new FakeNotesService();
    const target = "Private/diary.md" as VaultPath;
    notes.ignore(target);
    notes.unignore(target);
    expect(notes.isUserIgnored(target)).toBe(false);
  });
});

// Obsidian's adapter removes each file under a trashed folder before the folder itself, and the
// vault raises "delete" for every one of them; the real NotesService relays each as "deleted".
describe("FakeNotesService deleteFolder", () => {
  it("emits deleted for every note under the folder, nested ones included, and for nothing beside it", async () => {
    const notes = new FakeNotesService();
    notes.seed("project/a.md" as VaultPath);
    notes.seed("project/deep/b.md" as VaultPath);
    notes.seed("projects/c.md" as VaultPath);
    const deleted: VaultPath[] = [];
    notes.events.on("deleted", (removed) => deleted.push(removed));

    expectOk(await notes.deleteFolder("project" as VaultPath));

    expect(deleted.toSorted()).toEqual(["project/a.md", "project/deep/b.md"]);
    expect(notes.find("projects/c.md" as VaultPath).isSome()).toBe(true);
  });
});
