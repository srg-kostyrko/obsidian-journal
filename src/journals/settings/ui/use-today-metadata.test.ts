import { cleanup, render } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, type ComputedRef } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";
import { CycleService, FrontmatterService, JournalsIndex, NumberingService } from "@/journals";
import type { JournalMetadata } from "@/journals";
import { JournalsRepository } from "@/journals/repository";
import { fakeRepo, fixedJournal } from "@/journals/testing";

import { useTodayMetadata } from "./use-today-metadata";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-19T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
  teardown();
  cleanup();
});

function buildContainer(): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(JournalsRepository).useValue(fakeRepo({ daily: fixedJournal("daily", { type: "day" }) }));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  return c;
}

function probe(journalName: string): ComputedRef<JournalMetadata | undefined> {
  const container = buildContainer();
  let captured: ComputedRef<JournalMetadata | undefined> | undefined;
  const Probe = defineComponent({
    template: "<div />",
    setup() {
      captured = useTodayMetadata(journalName);
    },
  });
  render(Probe, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
  return captured!;
}

describe("useTodayMetadata", () => {
  it("returns today's metadata for an existing journal", () => {
    expect(probe("daily").value).toMatchObject({ journalName: "daily", anchor: "2026-05-19" });
  });

  it("returns undefined for a missing journal", () => {
    expect(probe("nope").value).toBeUndefined();
  });
});
