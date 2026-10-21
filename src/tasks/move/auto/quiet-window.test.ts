import { afterEach, describe, expect, it, vi } from "vitest";

import { NotesService, type VaultPath } from "@/infrastructure/host";
import { FakeNotesService } from "@/infrastructure/host/testing";
import { expectOk } from "@/infrastructure/result/testing";
import { tasksCoreModule } from "@/tasks/module";
import { overrideWith, testContainer } from "@/testing";

import { MAX_WAIT_MS, QUIET_MS, QuietWindow } from "./quiet-window";

const path = "Daily/2026-10-21.md" as VaultPath;

async function setup(): Promise<{ quiet: QuietWindow; notes: FakeNotesService }> {
  const notes = new FakeNotesService();
  notes.seed(path, "- [ ] one");
  const harness = await testContainer({
    modules: [tasksCoreModule],
    overrides: [overrideWith(NotesService, notes as never)],
  });
  vi.useFakeTimers();
  return { quiet: harness.resolve(QuietWindow), notes };
}

function settled(promise: Promise<"quiet" | "busy">): { value: "quiet" | "busy" | null } {
  const state: { value: "quiet" | "busy" | null } = { value: null };
  void promise.then((value) => {
    state.value = value;
  });
  return state;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("QuietWindow", () => {
  it("resolves quiet after five idle seconds", async () => {
    const { quiet } = await setup();
    const result = settled(quiet.wait());

    await vi.advanceTimersByTimeAsync(QUIET_MS - 1);
    expect(result.value).toBeNull();
    await vi.advanceTimersByTimeAsync(1);

    expect(result.value).toBe("quiet");
  });

  it("each event restarts the wait", async () => {
    const { quiet, notes } = await setup();
    const result = settled(quiet.wait());

    await vi.advanceTimersByTimeAsync(QUIET_MS - 1);
    notes.emitModified(path);
    await vi.advanceTimersByTimeAsync(QUIET_MS - 1);
    expectOk(await notes.create("Daily/2026-10-22.md" as VaultPath, ""));
    await vi.advanceTimersByTimeAsync(QUIET_MS - 1);
    expectOk(await notes.delete("Daily/2026-10-22.md" as VaultPath));
    await vi.advanceTimersByTimeAsync(QUIET_MS - 1);
    expect(result.value).toBeNull();
    await vi.advanceTimersByTimeAsync(1);

    expect(result.value).toBe("quiet");
  });

  it("a rename restarts the wait too", async () => {
    const { quiet, notes } = await setup();
    const result = settled(quiet.wait());

    await vi.advanceTimersByTimeAsync(QUIET_MS - 1);
    expectOk(await notes.rename(path, "Daily/renamed.md" as VaultPath));
    await vi.advanceTimersByTimeAsync(QUIET_MS - 1);
    expect(result.value).toBeNull();
    await vi.advanceTimersByTimeAsync(1);

    expect(result.value).toBe("quiet");
  });

  it("gives up busy at the ceiling", async () => {
    const { quiet, notes } = await setup();
    const result = settled(quiet.wait());

    for (let elapsed = 0; elapsed < MAX_WAIT_MS - 1000; elapsed += 1000) {
      await vi.advanceTimersByTimeAsync(1000);
      notes.emitModified(path);
    }
    expect(result.value).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);

    expect(result.value).toBe("busy");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("unsubscribes when done", async () => {
    const { quiet, notes } = await setup();
    const result = settled(quiet.wait());
    await vi.advanceTimersByTimeAsync(QUIET_MS);
    expect(result.value).toBe("quiet");
    expect(vi.getTimerCount()).toBe(0);

    notes.emitModified(path);
    expectOk(await notes.create("Daily/2026-10-22.md" as VaultPath, ""));
    expectOk(await notes.delete("Daily/2026-10-22.md" as VaultPath));

    expect(vi.getTimerCount()).toBe(0);
  });

  it("concurrent waits keep their own timers", async () => {
    const { quiet, notes } = await setup();
    const first = settled(quiet.wait());
    await vi.advanceTimersByTimeAsync(QUIET_MS - 1000);
    const second = settled(quiet.wait());

    await vi.advanceTimersByTimeAsync(1000);
    expect(first.value).toBe("quiet");
    expect(second.value).toBeNull();
    notes.emitModified(path);
    await vi.advanceTimersByTimeAsync(QUIET_MS);

    expect(second.value).toBe("quiet");
    expect(vi.getTimerCount()).toBe(0);
  });
});
