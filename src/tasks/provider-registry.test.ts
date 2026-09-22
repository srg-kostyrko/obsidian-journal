import { describe, expect, it, vi } from "vitest";

import { testContainer, type TestHarness, type TestOverride } from "@/testing";

import { TaskProviderRegistry } from "./provider-registry";
import { TaskProviderToken, type TaskProvider } from "./types";

function fakeProvider(id: string, dispose: () => void = vi.fn()): TaskProvider {
  return { id, start: vi.fn(() => dispose) };
}

function registers(provider: TaskProvider): TestOverride {
  return (c) => void c.register(TaskProviderToken).useValue(provider);
}

const registersRegistry: TestOverride = (c) => void c.register(TaskProviderRegistry).useClass(TaskProviderRegistry);

async function build(...providers: readonly TaskProvider[]): Promise<TestHarness> {
  return testContainer({ overrides: [...providers.map(registers), registersRegistry] });
}

describe("TaskProviderRegistry", () => {
  it("starts every registered provider", async () => {
    const a = fakeProvider("a");
    const b = fakeProvider("b");
    const harness = await build(a, b);

    harness.resolve(TaskProviderRegistry).initialize();

    expect(a.start).toHaveBeenCalledTimes(1);
    expect(b.start).toHaveBeenCalledTimes(1);
  });

  it("stops every provider through its own disposer when the container disposes", async () => {
    const disposeA = vi.fn();
    const disposeB = vi.fn();
    const harness = await build(fakeProvider("a", disposeA), fakeProvider("b", disposeB));

    harness.resolve(TaskProviderRegistry).initialize();
    await harness.dispose();

    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).toHaveBeenCalledTimes(1);
  });

  it("does nothing on dispose when initialize was never called", async () => {
    const harness = await build(fakeProvider("a"));
    await expect(harness.dispose()).resolves.toBeUndefined();
  });
});
