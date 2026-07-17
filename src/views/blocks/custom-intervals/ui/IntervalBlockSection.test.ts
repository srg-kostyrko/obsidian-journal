import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Calendar, type AnchorString } from "@/calendar";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { WorkspaceService, NoticeService } from "@/infrastructure/host";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  JournalsViewModel,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
  type JournalWrite,
} from "@/journals";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import { TemplateEngine } from "@/templates";

import IntervalBlockSection from "./IntervalBlockSection.vue";

afterEach(() => cleanup());

function mount(write: JournalWrite) {
  const container = new Container();
  const storage = reactive<Record<string, JournalConfig>>({ j: journalDefaultsFor(write, "j") });
  const repo = JournalsRepository.fromParts(storage, createNanoEvents<JournalsEvents>());
  const shelvesRepo = ShelvesRepository.fromParts(
    reactive({ home: { name: "home", journals: ["j"] } }),
    createNanoEvents<ShelvesEvents>(),
  );
  container.register(JournalsRepository).useValue(repo);
  container.register(JournalsViewModel).useValue(JournalsViewModel.fromRepository(repo));
  container.register(ShelvesRepository).useValue(shelvesRepo);
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useValue({ invoke: vi.fn() } as unknown as Flows);
  container.register(Calendar).useValue(new Calendar());
  container.register(TemplateEngine).useClass(TemplateEngine);
  container.register(CycleService).useClass(CycleService);
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(WorkspaceService).useValue({} as WorkspaceService);
  render(IntervalBlockSection, {
    props: { journalName: "j" },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("IntervalBlockSection", () => {
  it("renders the interval editor for a custom-write journal", () => {
    mount({ type: "custom", every: "day", duration: 1, anchorDate: "2026-01-01" as AnchorString });
    expect(screen.getByText(m.interval_block_section_title())).toBeTruthy();
  });

  it("renders nothing for a fixed-write journal", () => {
    mount({ type: "day" });
    expect(screen.queryByText(m.interval_block_section_title())).toBeNull();
  });
});
