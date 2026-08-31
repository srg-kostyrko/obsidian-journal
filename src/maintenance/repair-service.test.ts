import { describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { expectOk } from "@/infrastructure/result/testing";
import { FRONTMATTER_NAME_KEY, type JournalConfig } from "@/journals/config";
import { FrontmatterService } from "@/journals/frontmatter";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { NoteConnectionService } from "@/journals/notes/note-connection";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer, type FakeHost } from "@/testing";

import { maintenanceCoreModule } from "./module";
import { RepairService } from "./repair-service";

import type { RepairAction } from "./findings";

const WEEKLY = { weekly: fixedJournal("weekly", { type: "week" }) };

async function buildRepairs(journals: Record<string, JournalConfig> = WEEKLY) {
  const harness = await testContainer({
    modules: [journalsCoreModule, maintenanceCoreModule],
    data: { journals },
  });
  const connection = harness.resolve(NoteConnectionService);
  return {
    host: harness.host,
    service: harness.resolve(RepairService),
    index: harness.resolve(JournalsIndex),
    frontmatter: harness.resolve(FrontmatterService),
    // Spied through rather than replaced: the default path writes to the fake vault for real,
    // and only the tests that pin down timing or inject a failure override an implementation.
    reanchor: vi.spyOn(connection, "reanchor"),
    disconnect: vi.spyOn(connection, "disconnect"),
  };
}

function claim(host: FakeHost, path: string, journalName: string | undefined): void {
  host.putFile(path, "", journalName === undefined ? {} : { [FRONTMATTER_NAME_KEY]: journalName });
}

function rewrite(path: string, to: string): RepairAction {
  return { path: path as VaultPath, journalName: "weekly", repair: { kind: "rewrite", anchor: anchor(to) } };
}

describe("RepairService", () => {
  it("reports a note repaired once it is indexed at the intended anchor", async () => {
    const { service, index, reanchor } = await buildRepairs();
    reanchor.mockImplementation((journalName, path, target) => {
      index.register({ journalName, anchor: target.anchor, path });
      return AsyncResult.ok(undefined);
    });

    const result = await service.apply([rewrite("a.md", "2026-01-12")]);

    expectOk(result);
    expect(result.value.at(0)?.outcome).toEqual({ kind: "repaired" });
  });

  it("reports a note that was written but never reached the index", async () => {
    vi.useFakeTimers();
    const { service, host } = await buildRepairs();
    claim(host, "a.md", "weekly");

    const running = service.apply([rewrite("a.md", "2026-01-12")]);
    await vi.runAllTimersAsync();
    const result = await running;

    expectOk(result);
    expect(result.value.at(0)?.outcome).toEqual({ kind: "failed", reason: "still-rejected" });
    vi.useRealTimers();
  });

  it("lets a stale-range rewrite reclaim the anchor its own note already occupies", async () => {
    const { service, index, reanchor } = await buildRepairs();
    index.register({ journalName: "weekly", anchor: anchor("2026-01-12"), path: "a.md" as VaultPath });
    reanchor.mockImplementation((journalName, path, target) => {
      index.register({ journalName, anchor: target.anchor, path });
      return AsyncResult.ok(undefined);
    });

    const result = await service.apply([rewrite("a.md", "2026-01-12")]);

    expectOk(result);
    expect(result.value.at(0)?.outcome).toEqual({ kind: "repaired" });
    expect(reanchor).toHaveBeenCalledTimes(1);
  });

  it("refuses a second write onto an anchor this run already claimed", async () => {
    vi.useFakeTimers();
    const { service, host, reanchor } = await buildRepairs();
    claim(host, "a.md", "weekly");
    claim(host, "b.md", "weekly");

    const running = service.apply([rewrite("a.md", "2026-01-12"), rewrite("b.md", "2026-01-12")]);
    await vi.runAllTimersAsync();
    const result = await running;

    expectOk(result);
    expect(result.value.at(1)?.outcome).toEqual({ kind: "failed", reason: "contested" });
    expect(reanchor).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("records a write failure and keeps going", async () => {
    vi.useFakeTimers();
    const { service, host, reanchor } = await buildRepairs();
    claim(host, "b.md", "weekly");
    reanchor.mockReturnValueOnce(AsyncResult.err(new Error("disk full") as never));

    const running = service.apply([rewrite("a.md", "2026-01-12"), rewrite("b.md", "2026-01-19")]);
    await vi.runAllTimersAsync();
    const result = await running;

    expectOk(result);
    expect(result.value.at(0)?.outcome.kind).toBe("failed");
    expect(reanchor).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("strips a claim through the existing disconnect path", async () => {
    const { service, host, disconnect } = await buildRepairs();
    claim(host, "old.md", "gone");

    const result = await service.apply([
      { path: "old.md" as VaultPath, journalName: "gone", repair: { kind: "strip-claim" } },
    ]);

    expectOk(result);
    expect(disconnect).toHaveBeenCalledWith("old.md");
    expect(host.files.get("old.md")?.frontmatter).toEqual({});
    expect(result.value.at(0)?.outcome).toEqual({ kind: "repaired" });
  });

  it("strips through the journal's own configured fields when the journal still exists", async () => {
    const { service, host, frontmatter, disconnect } = await buildRepairs({
      weekly: fixedJournal(
        "weekly",
        { type: "week" },
        { frontmatter: { ...WEEKLY.weekly.frontmatter, dateField: "custom-date" } },
      ),
    });
    const clearMutator = vi.spyOn(frontmatter, "clearMutator");
    host.putFile("loser.md", "", { [FRONTMATTER_NAME_KEY]: "weekly", "custom-date": "2026-01-12", keep: "me" });

    const result = await service.apply([
      { path: "loser.md" as VaultPath, journalName: "weekly", repair: { kind: "strip-claim" } },
    ]);

    expectOk(result);
    expect(clearMutator).toHaveBeenCalledWith("weekly");
    // The journal's configured date field, not the default "journal-date", is what has to go.
    expect(host.files.get("loser.md")?.frontmatter).toEqual({ keep: "me" });
    expect(disconnect).not.toHaveBeenCalled();
    expect(result.value.at(0)?.outcome).toEqual({ kind: "repaired" });
  });

  it("does not settle a strip until the stripped note's metadata has actually changed", async () => {
    vi.useFakeTimers();
    const { service, host, disconnect } = await buildRepairs();
    claim(host, "old.md", "gone");
    // A write that reported success while the claim is still readable — metadataCache lags the
    // vault, so "the write returned" and "the note stopped claiming the journal" are two moments.
    disconnect.mockReturnValue(AsyncResult.ok(undefined));

    let settled = false;
    const running = service
      .apply([{ path: "old.md" as VaultPath, journalName: "gone", repair: { kind: "strip-claim" } }])
      .then((result) => {
        settled = true;
        return result;
      });

    // Short of the settle timeout, so this only proves anything if the wait is on the
    // metadata-changed signal rather than on microtask flush alone.
    await vi.advanceTimersByTimeAsync(1000);
    expect(settled).toBe(false);

    claim(host, "old.md", undefined);
    host.emitMetadata("old.md");
    await running;

    expect(settled).toBe(true);
    vi.useRealTimers();
  });

  it("reports a strip failed when the claim is still in place after the wait", async () => {
    vi.useFakeTimers();
    const { service, host, disconnect } = await buildRepairs();
    claim(host, "old.md", "gone");
    disconnect.mockReturnValue(AsyncResult.ok(undefined));

    const running = service.apply([
      { path: "old.md" as VaultPath, journalName: "gone", repair: { kind: "strip-claim" } },
    ]);
    await vi.runAllTimersAsync();
    const result = await running;

    expectOk(result);
    expect(result.value.at(0)?.outcome).toEqual({ kind: "failed", reason: "still-claimed" });
    vi.useRealTimers();
  });

  it("settles a strip whose metadata already dropped the claim before the listener attached", async () => {
    vi.useFakeTimers();
    const { service, host } = await buildRepairs();
    claim(host, "old.md", undefined);

    let settled = false;
    const running = service
      .apply([{ path: "old.md" as VaultPath, journalName: "gone", repair: { kind: "strip-claim" } }])
      .then((result) => {
        settled = true;
        return result;
      });

    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);

    const result = await running;
    expectOk(result);
    expect(result.value.at(0)?.outcome).toEqual({ kind: "repaired" });
    vi.useRealTimers();
  });

  it("rewrites a repaired notelet with the notelet mutator", async () => {
    vi.useFakeTimers();
    const { service, host } = await buildRepairs({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }) } },
      ),
    });
    const path = "standup.md" as VaultPath;
    host.putFile(path, "", { journal: "daily", "journal-date": "2026-01-11", "journal-end-date": "2026-01-11" });

    const running = service.apply([
      {
        path,
        journalName: "daily",
        noteletTypeName: "Standup",
        repair: { kind: "rewrite", anchor: anchor("2026-01-12") },
      },
    ]);
    await vi.runAllTimersAsync();
    const result = await running;

    expectOk(result);
    const frontmatter = host.files.get(path)?.frontmatter ?? {};
    expect(frontmatter).toMatchObject({ "journal-notelet": "Standup" });
    expect(frontmatter).not.toHaveProperty("journal-end-date");
    vi.useRealTimers();
  });

  it("never claims a period anchor for a notelet, so a period rewrite there is not contested", async () => {
    vi.useFakeTimers();
    const { service, host, reanchor } = await buildRepairs({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { notelets: { nt_1: buildNoteletType({ id: "nt_1" as TypeId, name: "Standup" }) } },
      ),
    });
    claim(host, "period.md", "daily");
    host.putFile("standup.md", "", { journal: "daily", "journal-date": "2026-01-11" });

    const running = service.apply([
      {
        path: "standup.md" as VaultPath,
        journalName: "daily",
        noteletTypeName: "Standup",
        repair: { kind: "rewrite", anchor: anchor("2026-01-12") },
      },
      {
        path: "period.md" as VaultPath,
        journalName: "daily",
        repair: { kind: "rewrite", anchor: anchor("2026-01-12") },
      },
    ]);
    await vi.runAllTimersAsync();
    const result = await running;

    expectOk(result);
    expect(result.value.at(1)?.outcome).not.toEqual({ kind: "failed", reason: "contested" });
    expect(reanchor).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does nothing for an undecidable action", async () => {
    const { service, reanchor } = await buildRepairs();

    await service.apply([
      {
        path: "a.md" as VaultPath,
        journalName: "weekly",
        repair: { kind: "undecidable", reason: "anchor-contested" },
      },
    ]);

    expect(reanchor).not.toHaveBeenCalled();
  });

  it("verifies each entry against its own intent when the same path appears twice in a batch", async () => {
    vi.useFakeTimers();
    const { service, index, reanchor } = await buildRepairs();
    reanchor.mockImplementation((journalName, path, target) => {
      index.register({ journalName, anchor: target.anchor, path });
      return AsyncResult.ok(undefined);
    });

    const running = service.apply([rewrite("a.md", "2026-01-12"), rewrite("a.md", "2026-01-19")]);
    await vi.runAllTimersAsync();
    const result = await running;

    expectOk(result);
    expect(result.value.at(0)?.outcome).toEqual({ kind: "failed", reason: "still-rejected" });
    expect(result.value.at(1)?.outcome).toEqual({ kind: "repaired" });
    vi.useRealTimers();
  });

  it("resolves through the entryChanged event without waiting out the settle timeout", async () => {
    vi.useFakeTimers();
    const { service, index, reanchor } = await buildRepairs();
    reanchor.mockImplementation((journalName, path, target) => {
      window.setTimeout(() => {
        index.register({ journalName, anchor: target.anchor, path });
      }, 0);
      return AsyncResult.ok(undefined);
    });

    const running = service.apply([rewrite("a.md", "2026-01-12")]);
    await vi.advanceTimersByTimeAsync(0);
    const result = await running;

    expectOk(result);
    expect(result.value.at(0)?.outcome).toEqual({ kind: "repaired" });
    vi.useRealTimers();
  });
});
