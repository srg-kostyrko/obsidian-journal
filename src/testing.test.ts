import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CannotOverrideError } from "@/infrastructure/di";
import { ContainerDisposedError } from "@/infrastructure/di";
import { InputSuggestService, NoticeService, SuggestService, TemplaterService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { CycleService, journalsCoreModule, journalsModule } from "@/journals";
import { JournalsRepository } from "@/journals/repository";
import { fixedJournal } from "@/journals/testing";
import { SettingsService } from "@/settings";

import { TestContainerLeakedHostStateError, testContainer, type TestHarness } from "./testing";

it("exposes a bound resolve", async () => {
  const harness = await testContainer({ modules: [journalsCoreModule] });

  expect(harness.resolve(CycleService)).toBeInstanceOf(CycleService);
});

// Cross-test ordering is normally a smell; here it is the subject under test — proving the
// disposer runs before the NEXT test starts is exactly the isolate:false leak it exists to prevent.
describe("disposal", () => {
  let leaked: TestHarness;

  it("builds a live harness", async () => {
    leaked = await testContainer();

    expect(leaked.resolve(SettingsService)).toBeDefined();
  });

  it("has disposed the previous test's container", () => {
    expect(() => leaked.resolve(SettingsService)).toThrow(ContainerDisposedError);
  });
});

describe("teardown from beforeEach", () => {
  let built: TestHarness;

  beforeEach(async () => {
    built = await testContainer();
  });

  it("resolves while the test is running", () => {
    expect(built.resolve(SettingsService)).toBeDefined();
  });

  it("has a live container in the next test too", () => {
    expect(built.resolve(SettingsService)).toBeDefined();
  });
});

describe("testContainer", () => {
  let harness: TestHarness | undefined;

  afterEach(async () => {
    await harness?.dispose();
    harness = undefined;
  });

  it("resolves a service from an opted-in feature module", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });

    expect(harness.resolve(CycleService)).toBeInstanceOf(CycleService);
  });

  it("seeds a journal through the real settings parse", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });

    expect(harness.resolve(JournalsRepository).get("daily").isSome()).toBe(true);
  });

  it("fills schema defaults for a partially-specified seeded journal", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: { name: "daily", write: { type: "day" } } } },
    });

    const stored = harness.resolve(JournalsRepository).get("daily");

    expect(stored.isSome() && stored.value.nameTemplate).toBe("{{date}}");
  });

  it("substitutes the fake modal service", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });

    expect(harness.resolve(ModalService)).toBe(harness.modals as unknown as ModalService);
  });

  it("exposes the fake modal service as a FakeModalService", async () => {
    harness = await testContainer({});

    expect(harness.modals).toBeInstanceOf(FakeModalService);
  });

  it("substitutes the fake notice service", async () => {
    harness = await testContainer({});

    expect(harness.resolve(NoticeService)).toBe(harness.notices);
  });

  it("substitutes the fake suggest service", async () => {
    harness = await testContainer({});

    expect(harness.resolve(SuggestService)).toBe(harness.suggests as unknown as SuggestService);
  });

  it("substitutes the fake input suggest service", async () => {
    harness = await testContainer({});

    expect(harness.resolve(InputSuggestService)).toBe(harness.inputSuggests as unknown as InputSuggestService);
  });

  it("substitutes the fake templater service", async () => {
    harness = await testContainer({});

    expect(harness.resolve(TemplaterService)).toBe(harness.templater as unknown as TemplaterService);
  });

  it("records nothing on the host when no feature module registers commands", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });

    expect([...harness.host.commands.keys()]).toHaveLength(0);
  });

  it("repairs a seeded journal that fails schema validation", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: { name: "daily" } } },
    });

    const stored = harness.resolve(JournalsRepository).get("daily");

    expect(stored.isSome() && stored.value.write.type).toBe("day");
  });

  it("takes effect for an override made before autoLoad runs", async () => {
    harness = await testContainer({ modules: [journalsCoreModule], autoLoad: false });
    const stub = { kind: "stub" } as unknown as JournalsRepository;

    harness.container.override(JournalsRepository).useValue(stub);

    expect(harness.resolve(JournalsRepository)).toBe(stub);
  });

  it("refuses overriding an eager service once autoLoad has resolved it", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });

    expect(() => harness?.container.override(JournalsRepository)).toThrow(
      expect.objectContaining({ reason: "resolved" } satisfies Partial<CannotOverrideError>),
    );
  });

  it("rejects when the seeded version cannot migrate", async () => {
    await expect(testContainer({ data: { version: 0 } }).then((created) => (harness = created))).rejects.toThrow();
  });

  it("throws a named error when a full module leaks host state", async () => {
    await expect(testContainer({ modules: [journalsModule] })).rejects.toThrow(TestContainerLeakedHostStateError);
  });
});
