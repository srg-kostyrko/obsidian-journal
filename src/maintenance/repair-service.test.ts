import { describe, expect, it, vi, type Mock } from "vitest";

import { anchor } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerModule } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";
import { expectOk } from "@/infrastructure/result/testing";
import { JournalsIndex } from "@/journals/journals-index";
import { NoteConnectionService } from "@/journals/notes/note-connection";

import { RepairService } from "./repair-service";

import type { RepairAction } from "./findings";

function build(): {
  service: RepairService;
  index: JournalsIndex;
  connection: {
    reanchor: Mock<NoteConnectionService["reanchor"]>;
    disconnect: Mock<NoteConnectionService["disconnect"]>;
  };
} {
  const connection = {
    reanchor: vi.fn<NoteConnectionService["reanchor"]>(() => AsyncResult.ok(undefined)),
    disconnect: vi.fn<NoteConnectionService["disconnect"]>(() => AsyncResult.ok(undefined)),
  };
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(NoteConnectionService).useValue(connection as unknown as NoteConnectionService);
  c.register(RepairService).useClass(RepairService);
  return { service: c.resolve(RepairService), index: c.resolve(JournalsIndex), connection };
}

function rewrite(path: string, to: string): RepairAction {
  return { path: path as VaultPath, journalName: "weekly", repair: { kind: "rewrite", anchor: anchor(to) } };
}

describe("RepairService", () => {
  it("reports a note repaired once it is indexed at the intended anchor", async () => {
    const { service, index, connection } = build();
    connection.reanchor.mockImplementation((journalName: string, path: VaultPath, target: { anchor: string }) => {
      index.register({ journalName, anchor: target.anchor as never, path });
      return AsyncResult.ok(undefined);
    });

    const result = await service.apply([rewrite("a.md", "2026-01-12")]);

    expectOk(result);
    expect(result.value.at(0)?.outcome).toEqual({ kind: "repaired" });
  });

  it("reports a note that was written but never reached the index", async () => {
    vi.useFakeTimers();
    const { service } = build();

    const running = service.apply([rewrite("a.md", "2026-01-12")]);
    await vi.runAllTimersAsync();
    const result = await running;

    expectOk(result);
    expect(result.value.at(0)?.outcome).toEqual({ kind: "failed", reason: "still-rejected" });
    vi.useRealTimers();
  });

  it("refuses a second write onto an anchor this run already claimed", async () => {
    const { service, connection } = build();

    const result = await service.apply([rewrite("a.md", "2026-01-12"), rewrite("b.md", "2026-01-12")]);

    expectOk(result);
    expect(result.value.at(1)?.outcome).toEqual({ kind: "failed", reason: "contested" });
    expect(connection.reanchor).toHaveBeenCalledTimes(1);
  });

  it("records a write failure and keeps going", async () => {
    const { service, connection } = build();
    connection.reanchor.mockReturnValueOnce(AsyncResult.err(new Error("disk full") as never));

    const result = await service.apply([rewrite("a.md", "2026-01-12"), rewrite("b.md", "2026-01-19")]);

    expectOk(result);
    expect(result.value.at(0)?.outcome.kind).toBe("failed");
    expect(connection.reanchor).toHaveBeenCalledTimes(2);
  });

  it("strips a claim through the existing disconnect path", async () => {
    const { service, connection } = build();

    const result = await service.apply([
      { path: "old.md" as VaultPath, journalName: "gone", repair: { kind: "strip-claim" } },
    ]);

    expectOk(result);
    expect(connection.disconnect).toHaveBeenCalledWith("old.md");
    expect(result.value.at(0)?.outcome).toEqual({ kind: "repaired" });
  });

  it("does nothing for an undecidable action", async () => {
    const { service, connection } = build();

    await service.apply([
      {
        path: "a.md" as VaultPath,
        journalName: "weekly",
        repair: { kind: "undecidable", reason: "anchor-contested" },
      },
    ]);

    expect(connection.reanchor).not.toHaveBeenCalled();
  });

  it("verifies each entry against its own intent when the same path appears twice in a batch", async () => {
    vi.useFakeTimers();
    const { service, index, connection } = build();
    connection.reanchor.mockImplementation((journalName: string, path: VaultPath, target: { anchor: string }) => {
      index.register({ journalName, anchor: target.anchor as never, path });
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
    const { service, index, connection } = build();
    connection.reanchor.mockImplementation((journalName: string, path: VaultPath, target: { anchor: string }) => {
      window.setTimeout(() => {
        index.register({ journalName, anchor: target.anchor as never, path });
      }, 0);
      return AsyncResult.ok(undefined);
    });

    const result = await service.apply([rewrite("a.md", "2026-01-12")]);

    expectOk(result);
    expect(result.value.at(0)?.outcome).toEqual({ kind: "repaired" });
  });
});
