import { afterEach, describe, expect, it } from "vitest";

import type { CannotOverrideError } from "@/infrastructure/di";
import { InputSuggestService, NoticeService, SuggestService, TemplaterService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { CycleService, journalsCoreModule } from "@/journals";
import { JournalsRepository } from "@/journals/repository";
import { fixedJournal } from "@/journals/testing";

import { testContainer, type TestHarness } from "./testing";

describe("testContainer", () => {
  let harness: TestHarness | undefined;

  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
  });

  it("resolves a service from an opted-in feature module", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });

    expect(harness.c.resolve(CycleService)).toBeInstanceOf(CycleService);
  });

  it("seeds a journal through the real settings parse", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });

    expect(harness.c.resolve(JournalsRepository).get("daily").isSome()).toBe(true);
  });

  it("fills schema defaults for a partially-specified seeded journal", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: { name: "daily", write: { type: "day" } } } },
    });

    const stored = harness.c.resolve(JournalsRepository).get("daily");

    expect(stored.isSome() && stored.value.nameTemplate).toBe("{{date}}");
  });

  it("substitutes the fake modal service", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });

    expect(harness.c.resolve(ModalService)).toBe(harness.modals as unknown as ModalService);
  });

  it("exposes the fake modal service as a FakeModalService", async () => {
    harness = await testContainer({});

    expect(harness.modals).toBeInstanceOf(FakeModalService);
  });

  it("substitutes the fake notice service", async () => {
    harness = await testContainer({});

    expect(harness.c.resolve(NoticeService)).toBe(harness.notices);
  });

  it("substitutes the fake suggest service", async () => {
    harness = await testContainer({});

    expect(harness.c.resolve(SuggestService)).toBe(harness.suggests as unknown as SuggestService);
  });

  it("substitutes the fake input suggest service", async () => {
    harness = await testContainer({});

    expect(harness.c.resolve(InputSuggestService)).toBe(harness.inputSuggests as unknown as InputSuggestService);
  });

  it("substitutes the fake templater service", async () => {
    harness = await testContainer({});

    expect(harness.c.resolve(TemplaterService)).toBe(harness.templater as unknown as TemplaterService);
  });

  it("records nothing on the host when no feature module registers commands", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });

    expect([...harness.host.commands.keys()]).toHaveLength(0);
  });

  it("logs a warning when a seeded journal fails schema validation", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: { name: "daily" } } },
    });

    expect(harness.logs.records).not.toEqual([]);
  });

  it("allows overriding an eager service before autoLoad runs", async () => {
    harness = await testContainer({ modules: [journalsCoreModule], autoLoad: false });

    expect(() => harness?.c.override(JournalsRepository)).not.toThrow();
  });

  it("refuses overriding an eager service once autoLoad has resolved it", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });

    expect(() => harness?.c.override(JournalsRepository)).toThrow(
      expect.objectContaining({ reason: "resolved" } satisfies Partial<CannotOverrideError>),
    );
  });

  it("rejects when the seeded version cannot migrate", async () => {
    await expect(testContainer({ data: { version: 0 } })).rejects.toThrow();
  });
});
