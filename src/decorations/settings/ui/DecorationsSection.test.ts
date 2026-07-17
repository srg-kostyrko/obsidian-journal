import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Calendar } from "@/calendar";
import type { JournalDecoration } from "@/decorations";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { NoticeService } from "@/infrastructure/host";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import {
  JournalsRepository,
  JournalsViewModel,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
} from "@/journals";

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

function buildJournal(name: string, decorations: JournalDecoration[]): JournalConfig {
  return { ...journalDefaultsFor({ type: "day" }, name), decorations };
}

function mount(decorations: JournalDecoration[]) {
  const container = new Container();
  const storage = reactive<Record<string, JournalConfig>>({ daily: buildJournal("daily", decorations) });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  const vm = JournalsViewModel.fromRepository(repo);
  const flows = { invoke: vi.fn() };
  container.register(JournalsRepository).useValue(repo);
  container.register(JournalsViewModel).useValue(vm);
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useValue(flows as unknown as Flows);
  container.register(Calendar).useValue(new Calendar());
  render(DecorationsSection, {
    props: { journalName: "daily" },
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
  return { flows };
}

describe("DecorationsSection", () => {
  it("renders the empty state when there are no decorations", async () => {
    mount([]);
    await userEvent.click(screen.getByText(m.decoration_section_title()));
    expect(screen.getByText(m.decoration_section_empty())).toBeTruthy();
  });

  it("renders a row description for each decoration", async () => {
    mount([sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title()));
    expect(screen.getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
  });

  it("invokes EditDecorationFlow with no index when Add is clicked", async () => {
    const { flows } = mount([sampleDecoration]);
    await userEvent.click(screen.getByLabelText(m.decoration_add()));
    expect(flows.invoke).toHaveBeenCalledWith(EditDecorationFlow, { journalName: "daily" });
  });

  it("invokes EditDecorationFlow with the index when Edit is clicked", async () => {
    const { flows } = mount([sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title()));
    await userEvent.click(screen.getByLabelText(m.decoration_edit()));
    expect(flows.invoke).toHaveBeenCalledWith(EditDecorationFlow, { journalName: "daily", index: 0 });
  });

  it("invokes DeleteDecorationFlow when Delete is clicked", async () => {
    const { flows } = mount([sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title()));
    await userEvent.click(screen.getByLabelText(m.decoration_delete()));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteDecorationFlow, { journalName: "daily", index: 0 });
  });
});
