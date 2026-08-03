import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { WorkspaceService, NoticeService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import {
  CycleService,
  JournalsIndex,
  NumberingService,
  JournalsRepository,
  JournalsViewModel,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
  type NavBlockRow,
} from "@/journals";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import { TemplateEngine } from "@/templates";

import { EditNavBlockRowFlow } from "../flows/edit-nav-row.flow";

import NavBlockSection from "./NavBlockSection.vue";

afterEach(() => cleanup());

function buildJournal(name: string, rows: NavBlockRow[]): JournalConfig {
  const base = journalDefaultsFor({ type: "day" }, name);
  return { ...base, navBlock: { ...base.navBlock, rows } };
}

function mount(rows: NavBlockRow[]) {
  const container = new Container();
  const storage = reactive<Record<string, JournalConfig>>({ daily: buildJournal("daily", rows) });
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
  container.register(WorkspaceService).useValue({} as WorkspaceService);
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
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

const sampleRow: NavBlockRow = {
  template: "{{date:YYYY}}",
  fontSize: 1,
  bold: false,
  italic: false,
  color: { type: "theme", name: "text-normal" },
  background: { type: "transparent" },
  link: "none",
  journal: "",
  addDecorations: false,
};

describe("NavBlockSection", () => {
  it("shows the empty-state message and 'use defaults' button when rows are empty", async () => {
    mount([]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    expect(screen.getByText(m.block_rows_empty())).toBeTruthy();
    expect(screen.getByText(m.nav_block_section_use_defaults({ writeType: "day" }))).toBeTruthy();
  });

  it("populates the rows with write-type defaults when 'use defaults' is clicked", async () => {
    const { storage } = mount([]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    await userEvent.click(screen.getByText(m.nav_block_section_use_defaults({ writeType: "day" })));
    expect(storage.daily?.navBlock.rows.length).toBeGreaterThan(0);
  });

  it("invokes the flow with rowIndex when an edit button is clicked", async () => {
    const { invoke } = mount([sampleRow]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    await userEvent.click(screen.getByLabelText(m.block_rows_edit_tooltip()));
    expect(invoke).toHaveBeenCalledWith(EditNavBlockRowFlow, { journalName: "daily", field: "navBlock", rowIndex: 0 });
  });

  it("invokes the flow without rowIndex when 'add row' is clicked", async () => {
    const { invoke } = mount([sampleRow]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    await userEvent.click(screen.getByLabelText(m.block_rows_add_row()));
    expect(invoke).toHaveBeenCalledWith(EditNavBlockRowFlow, { journalName: "daily", field: "navBlock" });
  });

  it("removes a row when its delete button is clicked", async () => {
    const { storage } = mount([sampleRow, { ...sampleRow, template: "{{date:MM}}" }]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    const deleteButtons = screen.getAllByLabelText(m.block_rows_delete_tooltip());
    await userEvent.click(deleteButtons[0]);
    expect(storage.daily?.navBlock.rows.length).toBe(1);
    expect(storage.daily?.navBlock.rows[0]?.template).toBe("{{date:MM}}");
  });

  it("swaps a row up when the up button is clicked on the second row", async () => {
    const a = { ...sampleRow, template: "A" };
    const b = { ...sampleRow, template: "B" };
    const { storage } = mount([a, b]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    const ups = screen.getAllByLabelText(m.common_action_move_up());
    await userEvent.click(ups.at(1)!);
    expect(storage.daily?.navBlock.rows.map((r) => r.template)).toEqual(["B", "A"]);
  });

  it("disables the up arrow on the first row", async () => {
    mount([
      { ...sampleRow, template: "A" },
      { ...sampleRow, template: "B" },
    ]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    expect(screen.getAllByLabelText(m.common_action_move_up()).map((b) => (b as HTMLButtonElement).disabled)).toEqual([
      true,
      false,
    ]);
  });

  it("disables the down arrow on the last row", async () => {
    mount([
      { ...sampleRow, template: "A" },
      { ...sampleRow, template: "B" },
    ]);
    await userEvent.click(screen.getByText(m.nav_block_section_title()));
    expect(screen.getAllByLabelText(m.common_action_move_down()).map((b) => (b as HTMLButtonElement).disabled)).toEqual(
      [false, true],
    );
  });
});
