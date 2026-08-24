import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { moment } from "obsidian";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { Calendar } from "@/calendar";
import { CUSTOM_LOCALE } from "@/calendar/calendar";
import { calendarSettingsCoreModule } from "@/calendar/settings/module";
import { calendarSlice } from "@/calendar/settings/slice";
import { anchor, installTestCalendar, testCalendar } from "@/calendar/testing";
import type { CannotOverrideError } from "@/infrastructure/di";
import { ContainerDisposedError, useService } from "@/infrastructure/di";
import { NoticeService } from "@/infrastructure/host";
import { useModal } from "@/infrastructure/host/modals";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import {
  CycleService,
  JournalsIndex,
  JournalsViewModel,
  VaultSubscriptionService,
  journalsCoreModule,
  journalsModule,
} from "@/journals";
import { JournalsRepository } from "@/journals/repository";
import { fixedJournal } from "@/journals/testing";
import { SettingsService } from "@/settings";

import {
  TestContainerInvalidSeedError,
  TestContainerLeakedHostStateError,
  TestContainerUnknownSeedKeyError,
  overrideWith,
  overrideWithClass,
  testContainer,
  type TestHarness,
} from "./testing";

it("exposes a bound resolve", async () => {
  const harness = await testContainer({ modules: [journalsCoreModule] });

  expect(harness.resolve(CycleService)).toBeInstanceOf(CycleService);
});

it("resolves the ambient test calendar rather than constructing its own", async () => {
  installTestCalendar({ dow: 0, doy: 6 });
  const harness = await testContainer();

  expect(harness.resolve(Calendar)).toBe(testCalendar());
  expect(moment.localeData(CUSTOM_LOCALE).firstDayOfWeek()).toBe(0);
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
  let built: TestHarness | undefined;
  let previous: TestHarness | undefined;

  beforeEach(async () => {
    previous = built;
    built = await testContainer();
  });

  it("resolves while the test is running", () => {
    expect(built?.resolve(SettingsService)).toBeDefined();
  });

  it("has disposed the harness the previous test built", () => {
    expect(() => previous?.resolve(SettingsService)).toThrow(ContainerDisposedError);
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
      allow: { dataRepair: true },
    });

    const stored = harness.resolve(JournalsRepository).get("daily");

    expect(stored.isSome() && stored.value.nameTemplate).toBe("{{date}}");
  });

  it("records nothing on the host when no feature module registers commands", async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });

    expect([...harness.host.commands.keys()]).toHaveLength(0);
  });

  it("replaces a seeded journal that is not an object with whole-entity defaults", async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: "nonsense" } },
      allow: { dataRepair: true },
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

describe("overrides", () => {
  it("replaces a service before eager construction resolves it", async () => {
    const seen: string[] = [];
    class RecordingCalendar extends Calendar {
      constructor() {
        super();
        seen.push("fake");
      }
    }

    const harness = await testContainer({ overrides: [overrideWithClass(Calendar, RecordingCalendar)] });

    expect(seen).toEqual(["fake"]);
    expect(harness.resolve(Calendar)).toBeInstanceOf(RecordingCalendar);
  });

  it("replaces a service the caller supplies as a value", async () => {
    const replacement = new FakeNoticeService();
    const harness = await testContainer({ overrides: [overrideWith(NoticeService, replacement)] });

    expect(harness.resolve(NoticeService)).toBe(replacement);
  });
});

describe("initialize", () => {
  it("routes a seeded note into the index when vault subscription is initialized", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      initialize: [VaultSubscriptionService],
    });
    harness.host.putFile("2026-05-19.md", "", { journal: "daily", "journal-date": "2026-05-19" });
    harness.host.emitMetadata("2026-05-19.md");

    expect(harness.resolve(JournalsIndex).get("daily", anchor("2026-05-19")).isSome()).toBe(true);
  });

  it("leaves a seeded note out of the index when it is not initialized", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    harness.host.putFile("2026-05-19.md", "", { journal: "daily", "journal-date": "2026-05-19" });

    expect(harness.resolve(JournalsIndex).get("daily", anchor("2026-05-19")).isNone()).toBe(true);
  });
});

describe("seed guard", () => {
  it("rejects a fixture the settings parse had to repair", async () => {
    await expect(
      testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: { ...fixedJournal("daily", { type: "day" }), dateFormat: "" } } },
      }),
    ).rejects.toThrow(TestContainerInvalidSeedError);
  });

  it("names the failing slice in the error", async () => {
    await expect(
      testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: { ...fixedJournal("daily", { type: "day" }), dateFormat: "" } } },
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        warnings: expect.arrayContaining([expect.stringContaining("journals/daily")]) as readonly string[],
      } satisfies Partial<TestContainerInvalidSeedError>),
    );
  });

  it("rejects a fixture whose slice the settings parse reset to defaults", async () => {
    await expect(
      testContainer({
        modules: [calendarSettingsCoreModule],
        data: { calendar: { mode: "custom", dow: 9, doy: 4, global: false } },
      }),
    ).rejects.toThrow(TestContainerInvalidSeedError);
  });

  it("rejects a fixture whose collection value is not an object", async () => {
    await expect(
      testContainer({
        modules: [journalsCoreModule],
        data: { journals: "nonsense" },
      }),
    ).rejects.toThrow(TestContainerInvalidSeedError);
  });

  it("rejects a seed key that no loaded module registers", async () => {
    await expect(
      testContainer({
        modules: [calendarSettingsCoreModule],
        data: { calender: { mode: "custom", dow: 1, doy: 4, global: false } },
      }),
    ).rejects.toThrow(TestContainerUnknownSeedKeyError);
  });

  it("names the unknown key in the error", async () => {
    await expect(
      testContainer({
        modules: [calendarSettingsCoreModule],
        data: { calender: { mode: "custom", dow: 1, doy: 4, global: false } },
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        keys: ["calender"],
      } satisfies Partial<TestContainerUnknownSeedKeyError>),
    );
  });

  it("accepts a seed key registered by a module the test opted into", async () => {
    const harness = await testContainer({
      modules: [calendarSettingsCoreModule],
      data: { calendar: { mode: "custom", dow: 1, doy: 4, global: false } },
    });

    expect(harness.settings.getSlice(calendarSlice).state).toEqual({ mode: "custom", dow: 1, doy: 4, global: false });
  });

  it("accepts a deliberately broken fixture when the test opts in", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: { ...fixedJournal("daily", { type: "day" }), dateFormat: "" } } },
      allow: { dataRepair: true },
    });

    expect(harness.resolve(JournalsRepository).get("daily").isSome()).toBe(true);
  });
});

describe("render", () => {
  it("provides the injector so a component can resolve a service", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    const Probe = defineComponent({
      setup: () => {
        const vm = useService(JournalsViewModel);
        return () => h("span", String(vm.journalCount.value));
      },
    });

    harness.render(Probe);

    expect(screen.getByText("1", { selector: "span" })).toBeTruthy();
  });

  it("keeps a caller-supplied global plugin", async () => {
    const harness = await testContainer();
    const installed: string[] = [];
    const Probe = defineComponent({ render: () => h("span", "ok") });

    harness.render(Probe, { global: { plugins: [{ install: () => void installed.push("caller") }] } });

    expect(installed).toEqual(["caller"]);
  });
});

describe("renderModal", () => {
  it("resolves the modal api's submit with the component's result", async () => {
    const harness = await testContainer();
    const Probe = defineComponent({
      setup: () => {
        const api = useModal<{ ok: boolean }>();
        return () => h("button", { onClick: () => api.submit({ ok: true }) }, "go");
      },
    });

    const { submit } = harness.renderModal(Probe);
    await userEvent.click(screen.getByText("go"));

    expect(submit).toHaveBeenCalledWith({ ok: true });
  });
});
