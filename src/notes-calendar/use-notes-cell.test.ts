import { render } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { defineComponent, h, reactive } from "vue";

import { DayPeriod } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows, FlowsModule } from "@/infrastructure/flows";
import { WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { FakeWorkspaceService } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";
import { AsyncResult } from "@/infrastructure/result";
import { CycleService, JournalsIndex, JournalsRepository, OpenDateFlow, TimelineService } from "@/journals";
import { fakeRepo, fixedJournal } from "@/journals/testing";

import { ActiveEntryViewModel } from "./active-entry";
import { FakeActiveEntryViewModel } from "./testing";
import { useNotesCell, type NotesCellApi } from "./use-notes-cell";

interface Harness {
  c: Container;
  workspace: FakeWorkspaceService;
  flows: Flows;
  active: FakeActiveEntryViewModel;
  index: JournalsIndex;
  invokeSpy: MockInstance<Flows["invoke"]>;
}

function renderDiv() {
  return h("div");
}

function buildHarness(): Harness {
  const c = new Container();
  c.addModule(LoggerModule);
  c.addModule(FlowsModule);

  const journals = reactive({
    daily: fixedJournal(
      "daily",
      { type: "day" },
      { timeline: { start: "2026-01-01" as AnchorString, end: { kind: "never" } } },
    ),
  });
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(TimelineService).useClass(TimelineService);

  const workspace = new FakeWorkspaceService();
  c.register(WorkspaceService).useValue(workspace as unknown as WorkspaceService);

  const active = new FakeActiveEntryViewModel();
  c.register(ActiveEntryViewModel).useValue(active as unknown as ActiveEntryViewModel);

  const flows = c.resolve(Flows);
  const invokeSpy = vi
    .spyOn(flows, "invoke")
    .mockImplementation(() => AsyncResult.ok({ path: "noop" as VaultPath, created: false }));
  const index = c.resolve(JournalsIndex);

  return { c, workspace, flows, active, index, invokeSpy };
}

function mountWithApi(c: Container, journalNames: () => readonly string[]): { api: NotesCellApi; unmount: () => void } {
  let captured: NotesCellApi | null = null;
  const Host = defineComponent({
    setup() {
      captured = useNotesCell({ journalNames });
      return renderDiv;
    },
  });
  const utilities = render(Host, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, c);
          },
        },
      ],
    },
  });
  if (!captured) throw new Error("api not captured");
  return { api: captured, unmount: () => utilities.unmount() };
}

const may25 = DayPeriod.containing(date("2026-05-25"));

describe("useNotesCell", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("isActionable", () => {
    it("is true when any in-scope journal covers the period's anchor", () => {
      const { c } = buildHarness();
      const { api } = mountWithApi(c, () => ["daily"]);
      expect(api.isActionable(may25)).toBe(true);
    });

    it("is false when no journal is in scope", () => {
      const { c } = buildHarness();
      const { api } = mountWithApi(c, () => []);
      expect(api.isActionable(may25)).toBe(false);
    });

    it("is false when the anchor is before every in-scope journal's timeline start", () => {
      const { c } = buildHarness();
      const { api } = mountWithApi(c, () => ["daily"]);
      const before = DayPeriod.containing(date("2025-12-31"));
      expect(api.isActionable(before)).toBe(false);
    });
  });

  describe("isActive", () => {
    it("is true when the active entry's journal + anchor match the period", () => {
      const { c, active } = buildHarness();
      const { api } = mountWithApi(c, () => ["daily"]);
      active.setActive({ journalName: "daily", anchor: may25.anchor.toAnchor() });
      expect(api.isActive(may25)).toBe(true);
    });

    it("is false when the active entry's journal is not in scope", () => {
      const { c, active } = buildHarness();
      const { api } = mountWithApi(c, () => ["daily"]);
      active.setActive({ journalName: "weekly", anchor: may25.anchor.toAnchor() });
      expect(api.isActive(may25)).toBe(false);
    });

    it("is false when active is null", () => {
      const { c } = buildHarness();
      const { api } = mountWithApi(c, () => ["daily"]);
      expect(api.isActive(may25)).toBe(false);
    });
  });

  describe("open", () => {
    it("invokes OpenDateFlow with the period anchor and journal names", () => {
      const { c, invokeSpy } = buildHarness();
      const { api } = mountWithApi(c, () => ["daily"]);
      const event = new MouseEvent("click");
      api.open(may25, event);

      expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, {
        anchor: may25.anchor.toAnchor(),
        journalNames: ["daily"],
        openMode: "active",
      });
    });

    it("passes openMode 'tab' when ctrl is held", () => {
      const { c, invokeSpy } = buildHarness();
      const { api } = mountWithApi(c, () => ["daily"]);
      api.open(may25, new MouseEvent("click", { ctrlKey: true }));
      expect(invokeSpy).toHaveBeenCalledWith(OpenDateFlow, expect.objectContaining({ openMode: "tab" }));
    });

    it("does not invoke OpenDateFlow when the cell is not actionable", () => {
      const { c, invokeSpy } = buildHarness();
      const { api } = mountWithApi(c, () => []);
      api.open(may25, new MouseEvent("click"));
      expect(invokeSpy).not.toHaveBeenCalled();
    });
  });
});
