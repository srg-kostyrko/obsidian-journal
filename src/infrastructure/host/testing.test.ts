import { describe, expect, it } from "vitest";

import { expectOk } from "@/infrastructure/result/testing";

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
