import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Calendar } from "@/calendar";
import {
  DecorationsStore,
  decorationsSlice,
  type CalendarDecoration,
  type DecorationOwner,
  type JournalDecoration,
} from "@/decorations";
import { m } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { NoticeService } from "@/infrastructure/host";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { JournalsRepository, journalDefaultsFor, type JournalConfig, type JournalsEvents } from "@/journals";
import { createSettingsService } from "@/settings/testing";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import type { ShelfConfig } from "@/shelves/config";

import { DeleteDecorationFlow } from "../flows/delete-decoration.flow";
import { EditDecorationFlow } from "../flows/edit-decoration.flow";

import DecorationsSection from "./DecorationsSection.vue";

afterEach(() => cleanup());

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
function mount(owner: DecorationOwner, decorations: readonly JournalDecoration[]) {
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
  container.register(JournalsRepository).useValue(journals);
  container.register(ShelvesRepository).useValue(shelves);
  container.register(DecorationsStore).useClass(DecorationsStore);
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useValue(flows as unknown as Flows);
  container.register(Calendar).useValue(new Calendar());

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
  return { flows, store };
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
});
