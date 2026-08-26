import { describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { NoteMetadataService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import type { JournalConfig } from "@/journals/config";
import { journalsCoreModule } from "@/journals/module";
import { NotePathService } from "@/journals/notes/note-path";
import { customJournal, fixedJournal } from "@/journals/testing";
import { testContainer, type FakeHost } from "@/testing";

import { maintenanceCoreModule } from "./module";
import { ScannedNoteResolver } from "./scanned-note";

async function buildResolver(journals: Record<string, JournalConfig>) {
  const harness = await testContainer({
    modules: [journalsCoreModule, maintenanceCoreModule],
    data: { journals },
  });
  return {
    host: harness.host,
    resolver: harness.resolve(ScannedNoteResolver),
    metadata: harness.resolve(NoteMetadataService),
    // Same container-scoped instance the resolver injected — resolving it again after
    // the resolver returns the cached singleton, not a fresh one.
    notePath: harness.resolve(NotePathService),
  };
}

function leaveUnparsed(host: FakeHost, path: string) {
  const cache = host.app.metadataCache;
  const parsed = cache.getFileCache.bind(cache);
  return vi.spyOn(cache, "getFileCache").mockImplementation((file) => (file.path === path ? null : parsed(file)));
}

describe("ScannedNoteResolver", () => {
  it("ignores a note that claims no journal", async () => {
    const { resolver, host } = await buildResolver({ daily: fixedJournal("daily", { type: "day" }) });
    host.putFile("Plain.md", "", { title: "hello" });

    expect(resolver.resolve("Plain.md" as VaultPath).kind).toBe("not-a-claim");
  });

  it("reports a note whose metadata has not been parsed yet", async () => {
    const { resolver, host } = await buildResolver({ daily: fixedJournal("daily", { type: "day" }) });
    host.putFile("Unparsed.md", "", { journal: "daily" });
    // A file landing in the vault and Obsidian having parsed it are two separate moments;
    // only the second one makes its frontmatter readable.
    const cache = leaveUnparsed(host, "Unparsed.md");

    expect(resolver.resolve("Unparsed.md" as VaultPath).kind).toBe("unparsed");
    // A missing file reports "unparsed" too, so the verdict alone proves nothing: the cache
    // read is what pins this to a note that is present in the vault but not yet parsed.
    expect(cache).toHaveBeenCalled();
  });

  it("skips a note belonging to a custom-interval journal", async () => {
    const { resolver, host } = await buildResolver({
      sprint: customJournal("sprint", "day", 14, "2026-01-05"),
    });
    host.putFile("Sprints/1.md", "", { journal: "sprint", "journal-date": "2026-01-05" });

    expect(resolver.resolve("Sprints/1.md" as VaultPath).kind).toBe("custom");
  });

  it("resolves a healthy note without inverting its path", async () => {
    const { resolver, host } = await buildResolver({ weekly: fixedJournal("weekly", { type: "week" }) });
    host.putFile("2026-W03.md", "", { journal: "weekly", "journal-date": "2026-01-12" });

    const outcome = resolver.resolve("2026-W03.md" as VaultPath);

    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") return;
    expect(outcome.note.storedAnchor).toBe(anchor("2026-01-12"));
    expect(outcome.note.canonicalAnchor).toBe(anchor("2026-01-12"));
    expect(outcome.note.pathAnchor).toBeUndefined();
  });

  it("inverts the path of a note whose stored date is not the period's anchor", async () => {
    const { resolver, host } = await buildResolver({
      weekly: fixedJournal("weekly", { type: "week" }, { nameTemplate: "{{date:YYYY-[W]ww}}" }),
    });
    host.putFile("2026-W03.md", "", { journal: "weekly", "journal-date": "2026-01-14" });

    const outcome = resolver.resolve("2026-W03.md" as VaultPath);

    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") return;
    expect(outcome.note.storedAnchor).toBe(anchor("2026-01-14"));
    expect(outcome.note.canonicalAnchor).toBe(anchor("2026-01-12"));
    expect(outcome.note.pathAnchor).toBe(anchor("2026-01-12"));
  });

  it("inverts the path of a note whose date field holds no readable date", async () => {
    const { resolver, host } = await buildResolver({
      weekly: fixedJournal("weekly", { type: "week" }, { nameTemplate: "{{date:YYYY-[W]ww}}" }),
    });
    host.putFile("2026-W03.md", "", { journal: "weekly", "journal-date": "[[2026-01-12]]" });

    const outcome = resolver.resolve("2026-W03.md" as VaultPath);

    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") return;
    expect(outcome.note.storedAnchor).toBeUndefined();
    expect(outcome.note.pathAnchor).toBe(anchor("2026-01-12"));
  });

  it("marks a note claiming a journal that no longer exists", async () => {
    const { resolver, host } = await buildResolver({ weekly: fixedJournal("weekly", { type: "week" }) });
    host.putFile("Old.md", "", { journal: "gone", "journal-date": "2026-01-12" });

    const outcome = resolver.resolve("Old.md" as VaultPath);

    expect(outcome.kind).toBe("resolved");
    if (outcome.kind !== "resolved") return;
    expect(outcome.note.journalExists).toBe(false);
    expect(outcome.note.claimedJournal).toBe("gone");
  });

  it("prepares a journal's path inverter only once across multiple stranded notes", async () => {
    const { resolver, host, notePath } = await buildResolver({
      weekly: fixedJournal("weekly", { type: "week" }, { nameTemplate: "{{date:YYYY-[W]ww}}" }),
    });
    // Both notes must be suspect — a healthy note never calls inverterFor at all,
    // so it would not exercise the cache either way.
    host.putFile("2026-W03.md", "", { journal: "weekly", "journal-date": "2026-01-14" });
    host.putFile("2026-W04.md", "", { journal: "weekly", "journal-date": "2026-01-21" });
    const inverterForSpy = vi.spyOn(notePath, "inverterFor");

    const first = resolver.resolve("2026-W03.md" as VaultPath);
    const second = resolver.resolve("2026-W04.md" as VaultPath);

    expect(first.kind).toBe("resolved");
    expect(second.kind).toBe("resolved");
    if (first.kind !== "resolved" || second.kind !== "resolved") return;
    expect(first.note.pathAnchor).toBe(anchor("2026-01-12"));
    expect(second.note.pathAnchor).toBe(anchor("2026-01-19"));
    // Without the per-journal cache each resolve would call inverterFor directly —
    // this would read 2, not 1.
    expect(inverterForSpy).toHaveBeenCalledTimes(1);
  });

  it("reports a note as unreadable when a collaborator throws", async () => {
    const { resolver, host, metadata } = await buildResolver({ weekly: fixedJournal("weekly", { type: "week" }) });
    host.putFile("2026-W03.md", "", { journal: "weekly", "journal-date": "2026-01-12" });
    vi.spyOn(metadata, "get").mockImplementationOnce(() => {
      throw new Error("boom");
    });

    const outcome = resolver.resolve("2026-W03.md" as VaultPath);

    expect(outcome).toEqual({ kind: "unreadable", message: "boom" });
  });
});
