import { afterEach, describe, expect, it, vi } from "vitest";

import type { VaultPath } from "@/infrastructure/host";

import { SelfWriteGuard } from "./self-write-guard";

const p = (s: string): VaultPath => s as VaultPath;

describe("SelfWriteGuard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("suppresses a marked path", () => {
    const guard = new SelfWriteGuard();
    guard.mark(p("a.md"));
    expect(guard.suppresses(p("a.md"))).toBe(true);
  });

  it("does not suppress an unmarked path", () => {
    expect(new SelfWriteGuard().suppresses(p("a.md"))).toBe(false);
  });

  it("stops suppressing after release", () => {
    const guard = new SelfWriteGuard();
    guard.mark(p("a.md"));
    guard.release(p("a.md"));
    expect(guard.suppresses(p("a.md"))).toBe(false);
  });

  it("stops suppressing once the window elapses", () => {
    vi.useFakeTimers();
    const guard = new SelfWriteGuard();
    guard.mark(p("a.md"));
    vi.advanceTimersByTime(5000);
    expect(guard.suppresses(p("a.md"))).toBe(false);
  });

  it("resets the suppression window when marked a second time", () => {
    vi.useFakeTimers();
    const guard = new SelfWriteGuard();
    guard.mark(p("a.md"));
    vi.advanceTimersByTime(4000);
    guard.mark(p("a.md"));
    vi.advanceTimersByTime(4000);
    expect(guard.suppresses(p("a.md"))).toBe(true);
  });
});
