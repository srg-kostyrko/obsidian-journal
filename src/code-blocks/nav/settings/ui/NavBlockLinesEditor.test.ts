import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, within } from "@testing-library/vue";
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
  FrontmatterService,
  NotePathService,
  NumberingService,
  JournalsRepository,
  JournalsViewModel,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
  type NavBlockSegment,
} from "@/journals";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import { TemplateEngine } from "@/templates";

import { EditNavBlockSegmentFlow } from "../flows/edit-nav-segment.flow";

import NavBlockLinesEditor from "./NavBlockLinesEditor.vue";

afterEach(() => cleanup());

const TITLE = "Interval rows";

function buildCustomJournal(name: string, lines: NavBlockSegment[][]): JournalConfig {
  const base = journalDefaultsFor(
    { type: "custom", every: "day", duration: 1, anchorDate: "2026-01-01" as AnchorString },
    name,
  );
  return {
    ...base,
    intervalBlock: { ...base.intervalBlock, lines, decorateWholeBlock: false },
  };
}

function mount(lines: NavBlockSegment[][]) {
  const container = new Container();
  const storage = reactive<Record<string, JournalConfig>>({ daily: buildCustomJournal("daily", lines) });
  const repo = JournalsRepository.fromParts(storage, createNanoEvents<JournalsEvents>());
  const shelvesRepo = ShelvesRepository.fromParts(
    reactive({ home: { name: "home", journals: ["daily"], decorations: [] } }),
    createNanoEvents<ShelvesEvents>(),
  );
  const invoke = vi.fn();
  container.register(JournalsRepository).useValue(repo);
  container.register(JournalsViewModel).useValue(JournalsViewModel.fromRepository(repo));
  container.register(ShelvesRepository).useValue(shelvesRepo);
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useValue({ invoke } as unknown as Flows);
  container.register(Calendar).useValue(new Calendar());
  container.register(TemplateEngine).useClass(TemplateEngine);
  container.register(CycleService).useClass(CycleService);
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(NumberingService).useClass(NumberingService);
  container.register(FrontmatterService).useClass(FrontmatterService);
  container.register(NotePathService).useClass(NotePathService);
  container.register(WorkspaceService).useValue({} as WorkspaceService);
  render(NavBlockLinesEditor, {
    props: { journalName: "daily", field: "intervalBlock", title: TITLE, icon: "list" },
    global: {
      plugins: [{ install: (app) => provideInjectorOnApp(app, container) }],
    },
  });
  return { storage, invoke };
}

const sampleSegment: NavBlockSegment = {
  template: "static text",
  fontSize: 1,
  bold: false,
  italic: false,
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  link: "none",
  journal: "",
  linkDate: "",
  addDecorations: false,
};

describe("NavBlockLinesEditor", () => {
  it("hides the mode dropdown when mode is not enabled", async () => {
    mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    expect(screen.queryByText(m.nav_block_section_mode_label())).toBeNull();
  });

  it("hides the use-defaults button when useDefaults is not enabled", async () => {
    mount([]);
    await userEvent.click(screen.getByText(TITLE));
    expect(screen.queryByText(m.nav_block_section_use_defaults({ writeType: "custom" }))).toBeNull();
  });

  it("invokes the flow with the intervalBlock field when the header 'add row' button is clicked", async () => {
    const { invoke } = mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    await userEvent.click(screen.getAllByLabelText(m.block_rows_add_row()).at(0)!);
    expect(invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, { journalName: "daily", field: "intervalBlock" });
  });

  it("invokes the flow with lineIndex when a line's gutter 'add' button is clicked", async () => {
    const { invoke } = mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    const preview = document.querySelector<HTMLElement>(".nav-block-preview")!;
    await userEvent.click(within(preview).getByLabelText(m.block_rows_add_row()));
    expect(invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, {
      journalName: "daily",
      field: "intervalBlock",
      lineIndex: 0,
    });
  });

  it("invokes the flow with lineIndex and segmentIndex when a segment is clicked", async () => {
    const { invoke } = mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    await userEvent.click(screen.getByText("static text"));
    expect(invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, {
      journalName: "daily",
      field: "intervalBlock",
      lineIndex: 0,
      segmentIndex: 0,
    });
  });

  it("shows a placeholder for an empty segment that stays clickable", async () => {
    const emptySegment: NavBlockSegment = { ...sampleSegment, template: "" };
    const { invoke } = mount([[emptySegment]]);
    await userEvent.click(screen.getByText(TITLE));
    const placeholder = screen.getByText("—");
    await userEvent.click(placeholder);
    expect(invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, {
      journalName: "daily",
      field: "intervalBlock",
      lineIndex: 0,
      segmentIndex: 0,
    });
  });

  it("invokes the flow when Enter is pressed on a focused segment", async () => {
    const { invoke } = mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    const segmentEl = screen.getByText("static text");
    segmentEl.focus();
    await userEvent.keyboard("{Enter}");
    expect(invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, {
      journalName: "daily",
      field: "intervalBlock",
      lineIndex: 0,
      segmentIndex: 0,
    });
  });

  it("removes a line from intervalBlock when its delete button is clicked", async () => {
    const { storage } = mount([[sampleSegment], [{ ...sampleSegment, template: "other" }]]);
    await userEvent.click(screen.getByText(TITLE));
    const deleteButtons = screen.getAllByLabelText(m.block_rows_delete_tooltip());
    await userEvent.click(deleteButtons[0]);
    expect(storage.daily?.intervalBlock.lines.map((line) => line[0]?.template)).toEqual(["other"]);
  });

  it("toggles decorateWholeBlock on intervalBlock", async () => {
    const { storage } = mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    await userEvent.click(screen.getByRole("checkbox"));
    expect(storage.daily?.intervalBlock.decorateWholeBlock).toBe(true);
  });
});
