import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, within } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Calendar } from "@/calendar";
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

import NavBlockSection from "./NavBlockSection.vue";

afterEach(() => cleanup());

function buildJournal(name: string, lines: NavBlockSegment[][]): JournalConfig {
  const base = journalDefaultsFor({ type: "day" }, name);
  return { ...base, navBlock: { ...base.navBlock, lines } };
}

function mount(lines: NavBlockSegment[][]) {
  const container = new Container();
  const storage = reactive<Record<string, JournalConfig>>({ daily: buildJournal("daily", lines) });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
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
  render(NavBlockSection, {
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

describe("NavBlockSection", () => {
  it("shows the empty-state message and 'use defaults' button when lines are empty", async () => {
    mount([]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    expect(screen.getByText(m.block_lines_empty())).toBeTruthy();
    expect(screen.getByText(m.nav_block_section_use_defaults({ writeType: "day" }))).toBeTruthy();
  });

  it("populates the lines with write-type defaults when 'use defaults' is clicked", async () => {
    const { storage } = mount([]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    await userEvent.click(screen.getByText(m.nav_block_section_use_defaults({ writeType: "day" })));
    expect(storage.daily?.navBlock.lines.length).toBeGreaterThan(0);
  });

  it("invokes the flow with lineIndex and segmentIndex when a segment is clicked", async () => {
    const { invoke } = mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    await userEvent.click(screen.getByText("static text"));
    expect(invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, {
      journalName: "daily",
      field: "navBlock",
      lineIndex: 0,
      segmentIndex: 0,
    });
  });

  it("invokes the flow without indices when the header 'add line' button is clicked", async () => {
    const { invoke } = mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    await userEvent.click(screen.getByLabelText(m.block_lines_add_line()));
    expect(invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, { journalName: "daily", field: "navBlock" });
  });

  it("invokes the flow with only lineIndex when a line's gutter 'add' button is clicked", async () => {
    const { invoke } = mount([[sampleSegment]]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    const preview = document.querySelector<HTMLElement>(".nav-block-preview")!;
    await userEvent.click(within(preview).getByLabelText(m.block_lines_add_segment()));
    expect(invoke).toHaveBeenCalledWith(EditNavBlockSegmentFlow, {
      journalName: "daily",
      field: "navBlock",
      lineIndex: 0,
    });
  });

  it("removes a line when its delete button is clicked", async () => {
    const { storage } = mount([[sampleSegment], [{ ...sampleSegment, template: "{{date:MM}}" }]]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    const deleteButtons = screen.getAllByLabelText(m.block_lines_delete_tooltip());
    await userEvent.click(deleteButtons[0]);
    expect(storage.daily?.navBlock.lines.length).toBe(1);
    expect(storage.daily?.navBlock.lines[0]?.[0]?.template).toBe("{{date:MM}}");
  });

  it("swaps a line up when the up button is clicked on the second line", async () => {
    const a = { ...sampleSegment, template: "A" };
    const b = { ...sampleSegment, template: "B" };
    const { storage } = mount([[a], [b]]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    const ups = screen.getAllByLabelText(m.common_action_move_up());
    await userEvent.click(ups.at(1)!);
    expect(storage.daily?.navBlock.lines.map((line) => line[0]?.template)).toEqual(["B", "A"]);
  });

  it("disables the up arrow on the first line", async () => {
    mount([[{ ...sampleSegment, template: "A" }], [{ ...sampleSegment, template: "B" }]]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    expect(screen.getAllByLabelText(m.common_action_move_up()).map((b) => (b as HTMLButtonElement).disabled)).toEqual([
      true,
      false,
    ]);
  });

  it("disables the down arrow on the last line", async () => {
    mount([[{ ...sampleSegment, template: "A" }], [{ ...sampleSegment, template: "B" }]]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    expect(screen.getAllByLabelText(m.common_action_move_down()).map((b) => (b as HTMLButtonElement).disabled)).toEqual(
      [false, true],
    );
  });
});
