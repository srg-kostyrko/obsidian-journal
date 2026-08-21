import { describe, expect, it } from "vitest";

import { NoticeService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { CycleService, journalsCoreModule } from "@/journals";
import { JournalsRepository } from "@/journals/repository";
import { fixedJournal } from "@/journals/testing";

import { testContainer } from "./testing";

describe("testContainer", () => {
  it("resolves a service from an opted-in feature module", async () => {
    const { c } = await testContainer({ modules: [journalsCoreModule] });

    expect(c.resolve(CycleService)).toBeInstanceOf(CycleService);
  });

  it("seeds a journal through the real settings parse", async () => {
    const { c } = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });

    expect(c.resolve(JournalsRepository).get("daily").isSome()).toBe(true);
  });

  it("fills schema defaults for a partially-specified seeded journal", async () => {
    const { c } = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: { name: "daily", write: { type: "day" } } } },
    });

    const stored = c.resolve(JournalsRepository).get("daily");

    expect(stored.isSome() && stored.value.nameTemplate).toBe("{{date}}");
  });

  it("substitutes the fake modal service", async () => {
    const { c, modals } = await testContainer({ modules: [journalsCoreModule] });

    expect(c.resolve(ModalService)).toBe(modals as unknown as ModalService);
  });

  it("exposes the fake modal service as a FakeModalService", async () => {
    const { modals } = await testContainer({});

    expect(modals).toBeInstanceOf(FakeModalService);
  });

  it("substitutes the fake notice service", async () => {
    const { c, notices } = await testContainer({});

    expect(c.resolve(NoticeService)).toBe(notices);
  });

  it("records nothing on the host when no feature module registers commands", async () => {
    const { host } = await testContainer({ modules: [journalsCoreModule] });

    expect([...host.commands.keys()]).toHaveLength(0);
  });

  it("captures log records in the memory sink", async () => {
    const { logs } = await testContainer({});

    expect(logs.records).toEqual([]);
  });

  it("skips eager construction when autoLoad is false", async () => {
    const { c } = await testContainer({ modules: [journalsCoreModule], autoLoad: false });

    expect(c.resolve(CycleService)).toBeInstanceOf(CycleService);
  });
});
