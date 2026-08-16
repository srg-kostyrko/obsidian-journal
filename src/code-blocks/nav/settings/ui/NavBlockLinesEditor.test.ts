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

function buildCustomJournal(name: string, lines: NavBlockSegment[][], decorateWholeBlock = false): JournalConfig {
  const base = journalDefaultsFor(
    { type: "custom", every: "day", duration: 1, anchorDate: "2026-01-01" as AnchorString },
    name,
  );
  return {
    ...base,
    intervalBlock: { ...base.intervalBlock, lines, decorateWholeBlock },
  };
}

function mount(lines: NavBlockSegment[][], decorateWholeBlock = false) {
  const container = new Container();
  const storage = reactive<Record<string, JournalConfig>>({
    daily: buildCustomJournal("daily", lines, decorateWholeBlock),
  });
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

  it("marks segments as editable so they carry a hover and focus affordance for drag and edit", async () => {
    mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    const segment = document.querySelector<HTMLElement>(".nav-block-preview .nav-row");
    expect(segment?.classList.contains("nav-row--editable")).toBe(true);
  });

  it("lets a lone segment fill its line so its background and click target span the block", async () => {
    mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    const line = document.querySelector<HTMLElement>(".nav-block-line");
    expect(line?.classList.contains("nav-block-line--multi")).toBe(false);
  });

  it("marks a line holding several segments so they hug their text instead of sharing the width", async () => {
    mount([[sampleSegment, { ...sampleSegment, template: "second" }]]);
    await userEvent.click(screen.getByText(TITLE));
    const line = document.querySelector<HTMLElement>(".nav-block-line");
    expect(line?.classList.contains("nav-block-line--multi")).toBe(true);
  });

  it("invokes the flow with the intervalBlock field when the header 'add line' button is clicked", async () => {
    const { invoke } = mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    await userEvent.click(screen.getByLabelText(m.block_lines_add_line()));
    expect(invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, { journalName: "daily", field: "intervalBlock" });
  });

  it("invokes the flow with lineIndex when a line's gutter 'add' button is clicked", async () => {
    const { invoke } = mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    const preview = document.querySelector<HTMLElement>(".nav-block-preview")!;
    await userEvent.click(within(preview).getByLabelText(m.block_lines_add_segment()));
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

  it("invokes the flow with lineIndex and segmentIndex when a segment is clicked, with the whole block decorated", async () => {
    // customIntervalBlock's shipped default has decorateWholeBlock: true — the only branch of
    // NavBlock's two render paths this editor drives in production. Cover it explicitly rather
    // than only the decorateWholeBlock: false branch every other test in this file exercises.
    const { invoke } = mount([[sampleSegment]], true);
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

  it("uses the segment's own text as the accessible name when it is not empty", async () => {
    mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    expect(screen.getByRole("button", { name: "static text" })).toBeTruthy();
  });

  it("uses the empty-segment message as the accessible name for an empty segment", async () => {
    const emptySegment: NavBlockSegment = { ...sampleSegment, template: "" };
    mount([[emptySegment]]);
    await userEvent.click(screen.getByText(TITLE));
    expect(screen.getByRole("button", { name: m.block_lines_empty_segment() })).toBeTruthy();
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
    const deleteButtons = screen.getAllByLabelText(m.block_lines_delete_tooltip());
    await userEvent.click(deleteButtons[0]);
    expect(storage.daily?.intervalBlock.lines.map((line) => line[0]?.template)).toEqual(["other"]);
  });

  it("renders a leading drop zone above the first line, so a segment can split into a new first line", async () => {
    mount([[sampleSegment], [{ ...sampleSegment, template: "other" }]]);
    await userEvent.click(screen.getByText(TITLE));
    const preview = document.querySelector<HTMLElement>(".nav-block-preview")!;
    const dropZones = [...preview.querySelectorAll<HTMLElement>(".nav-line-drop")];
    expect(dropZones[0]?.dataset.lineIndex).toBe("0");
    // One before every line and one after each, so two lines get three zones: 0, 1, 2.
    expect(dropZones.map((el) => el.dataset.lineIndex)).toEqual(["0", "1", "2"]);
  });

  it("toggles decorateWholeBlock on intervalBlock", async () => {
    const { storage } = mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(TITLE));
    await userEvent.click(screen.getByRole("checkbox"));
    expect(storage.daily?.intervalBlock.decorateWholeBlock).toBe(true);
  });
});
