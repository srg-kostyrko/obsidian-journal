import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Calendar, CalendarDate } from "@/calendar";
import { installTestCalendar, testCalendar } from "@/calendar/testing";
import {
  DecorationEngine,
  DecorationMatchService,
  DecorationsStore,
  decorationsSlice,
  type CalendarDecoration,
  type DecorationOwner,
  type JournalDecoration,
} from "@/decorations";
import { m } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { NoteMetadataService, NoteSizeService, NoticeService, type VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoteMetadataService, FakeNoteSizeService, FakeNoticeService } from "@/infrastructure/host/testing";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  TimelineService,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
} from "@/journals";
import { createSettingsService } from "@/settings/testing";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import type { ShelfConfig } from "@/shelves/config";

import { buildCondition, buildDecoration, buildStyle } from "../../testing";
import { decorationBreakdownModal } from "../../ui/modals";
import { DeleteDecorationFlow } from "../flows/delete-decoration.flow";
import { EditDecorationFlow } from "../flows/edit-decoration.flow";

import DecorationsSection from "./DecorationsSection.vue";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
});
afterEach(() => {
  vi.useRealTimers();
  teardown();
  cleanup();
});

const transparent = { type: "transparent" as const };
const sampleDecoration: JournalDecoration = {
  mode: "and",
  conditions: [{ type: "has-note" }],
  styles: [{ type: "background", color: transparent }],
};
const sampleCalendarDecoration: CalendarDecoration = {
  mode: "and",
  conditions: [{ type: "weekday", weekdays: [6] }],
  styles: [{ type: "background", color: transparent }],
};

function buildJournal(name: string, decorations: JournalDecoration[]): JournalConfig {
  return { ...journalDefaultsFor({ type: "day" }, name), decorations };
}

// Seeds decorations only into the storage backing the owner under test, so a mismatched owner
// (e.g. a journal owner while a shelf has decorations) would surface as a genuine test failure.
function mount(owner: DecorationOwner, decorations: readonly JournalDecoration[], options: { hasNote?: boolean } = {}) {
  const { container, service } = createSettingsService({ slices: [decorationsSlice] });

  const journalDecorations = owner.kind === "journal" ? [...decorations] : [];
  const journalStorage = reactive<Record<string, JournalConfig>>({
    daily: buildJournal("daily", journalDecorations),
  });
  const journals = JournalsRepository.fromParts(journalStorage, createNanoEvents<JournalsEvents>());

  const shelfDecorations = owner.kind === "shelf" ? (decorations as CalendarDecoration[]) : [];
  const shelfStorage = reactive<Record<string, ShelfConfig>>({
    work: { name: "work", journals: [], decorations: [...shelfDecorations] },
  });
  const shelves = ShelvesRepository.fromParts(shelfStorage, createNanoEvents<ShelvesEvents>());

  if (owner.kind === "global") {
    service.getSlice(decorationsSlice).state = { decorations: [...(decorations as CalendarDecoration[])] };
  }

  const flows = { invoke: vi.fn() };
  const modals = new FakeModalService();
  const fakeMetadata = new FakeNoteMetadataService();
  container.register(JournalsRepository).useValue(journals);
  container.register(ShelvesRepository).useValue(shelves);
  container.register(DecorationsStore).useClass(DecorationsStore);
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useValue(flows as unknown as Flows);
  container.register(Calendar).useValue(testCalendar());
  container.register(ModalService).useValue(modals as unknown as ModalService);
  const index = new JournalsIndex();
  if (options.hasNote) {
    const anchor = CalendarDate.today().toAnchor();
    const path = `Daily/${anchor}.md` as VaultPath;
    index.register({ journalName: "daily", anchor, path });
    fakeMetadata.setMetadata(path, { title: "daily", tags: [], properties: {}, tasks: [] });
  }
  container.register(JournalsIndex).useValue(index);
  container.register(CycleService).useClass(CycleService);
  container.register(TimelineService).useClass(TimelineService);
  container.register(NoteMetadataService).useValue(fakeMetadata as unknown as NoteMetadataService);
  container.register(NoteSizeService).useValue(new FakeNoteSizeService() as unknown as NoteSizeService);
  container.register(DecorationEngine).useClass(DecorationEngine);
  container.register(DecorationMatchService).useClass(DecorationMatchService);

  const store = container.resolve(DecorationsStore);

  render(DecorationsSection, {
    props: { owner },
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
  return { flows, modals, store };
}

describe("DecorationsSection", () => {
  it("renders the empty state when there are no decorations", async () => {
    mount({ kind: "journal", journalName: "daily" }, []);
    await userEvent.click(screen.getByText(m.decoration_section_title_journal()));
    expect(screen.getByText(m.decoration_section_empty())).toBeTruthy();
  });

  it("renders a row description for each decoration", async () => {
    mount({ kind: "journal", journalName: "daily" }, [sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title_journal()));
    expect(screen.getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
  });

  it("renders a preview swatch for each decoration", async () => {
    mount({ kind: "journal", journalName: "daily" }, [sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title_journal()));
    // Every other row assertion targets describeCondition text, which renders regardless of
    // whether DecorationPreview resolves — an unresolved component still renders its slot
    // content as an unknown element. Assert on DecorationPreview's own testid so a dropped
    // import (which Vue only warns about, not throws on) fails this test.
    expect(screen.getByTestId("decoration-preview")).toBeTruthy();
  });

  it("invokes EditDecorationFlow with no index when Add is clicked", async () => {
    const { flows } = mount({ kind: "journal", journalName: "daily" }, [sampleDecoration]);
    await userEvent.click(screen.getByLabelText(m.decoration_add()));
    expect(flows.invoke).toHaveBeenCalledWith(EditDecorationFlow, {
      owner: { kind: "journal", journalName: "daily" },
    });
  });

  it("invokes EditDecorationFlow with the index when Edit is clicked", async () => {
    const { flows } = mount({ kind: "journal", journalName: "daily" }, [sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title_journal()));
    await userEvent.click(screen.getByLabelText(m.decoration_edit()));
    expect(flows.invoke).toHaveBeenCalledWith(EditDecorationFlow, {
      owner: { kind: "journal", journalName: "daily" },
      index: 0,
    });
  });

  it("invokes DeleteDecorationFlow when Delete is clicked", async () => {
    const { flows } = mount({ kind: "journal", journalName: "daily" }, [sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title_journal()));
    await userEvent.click(screen.getByLabelText(m.decoration_delete()));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteDecorationFlow, {
      owner: { kind: "journal", journalName: "daily" },
      index: 0,
    });
  });

  it("titles the section for a shelf owner", async () => {
    mount({ kind: "shelf", shelfName: "work" }, [sampleCalendarDecoration]);
    expect(screen.getByText(m.decoration_section_title_shelf())).toBeTruthy();
  });

  it("lists a shelf's decorations", async () => {
    mount({ kind: "shelf", shelfName: "work" }, [sampleCalendarDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title_shelf()));
    expect(screen.getAllByLabelText(m.decoration_edit())).toHaveLength(1);
  });

  it("invokes the edit flow with the global owner", async () => {
    const { flows } = mount({ kind: "global" }, []);
    await userEvent.click(screen.getByLabelText(m.decoration_add()));
    expect(flows.invoke).toHaveBeenCalledWith(EditDecorationFlow, { owner: { kind: "global" } });
  });

  it("opens the breakdown modal from the inspect button", async () => {
    const { modals } = mount({ kind: "journal", journalName: "daily" }, [sampleDecoration]);
    await userEvent.click(screen.getByLabelText(m.decoration_breakdown_open()));
    expect(modals.lastOpen().definition).toBe(decorationBreakdownModal);
  });

  it("shows the match count on a decoration that fires", async () => {
    // A Monday-only decoration matches 13 of the last 90 days ending on the pinned Monday —
    // an implementation that reports the window total instead of the real match count (or
    // that never renders a badge at all) fails this.
    vi.useFakeTimers();
    // 2026-05-25 is a Monday.
    vi.setSystemTime(new Date(2026, 4, 25, 9, 0, 0));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const decoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("weekday", { weekdays: [1] })],
      styles: [buildStyle("background")],
    });
    mount({ kind: "journal", journalName: "daily" }, [decoration]);
    await user.click(screen.getByText(m.decoration_section_title_journal()));

    expect(screen.getByText(m.decoration_badge_matched_past({ matched: 13, total: 90, unit: "day" }))).toBeTruthy();
  });

  it("shows the no-notes badge on a note-needing decoration with no notes in the window", async () => {
    // has-note is the only condition, and no note is registered in the index, so the row must
    // report "no notes yet" rather than misreading the empty index as a silent (0-match) badge.
    mount({ kind: "journal", journalName: "daily" }, [sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title_journal()));

    expect(screen.getByText(m.decoration_badge_no_notes())).toBeTruthy();
  });

  it("renders no badge row for a note-size decoration", async () => {
    // The badge would need up to 90 unwarmed file reads with no reactive path to correct it,
    // so it goes silent — and the row must be absent entirely, not an empty line.
    const noteSizeDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("note-size", { condition: "gt", value: 100 })],
      styles: [buildStyle("background")],
    });
    mount({ kind: "journal", journalName: "daily" }, [noteSizeDecoration], { hasNote: true });
    await userEvent.click(screen.getByText(m.decoration_section_title_journal()));

    expect(document.querySelector(".row-badge")).toBeNull();
  });
});
