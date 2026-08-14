import userEvent from "@testing-library/user-event";
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

import NavBlockRowsEditor from "./NavBlockRowsEditor.vue";

afterEach(() => cleanup());

const TITLE = "Interval rows";

function buildCustomJournal(name: string, rows: NavBlockRow[]): JournalConfig {
  const base = journalDefaultsFor(
    { type: "custom", every: "day", duration: 1, anchorDate: "2026-01-01" as AnchorString },
    name,
  );
  return { ...base, intervalBlock: { ...base.intervalBlock, rows, decorateWholeBlock: false } };
}

function mount(rows: NavBlockRow[]) {
  const container = new Container();
  const storage = reactive<Record<string, JournalConfig>>({ daily: buildCustomJournal("daily", rows) });
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
  container.register(WorkspaceService).useValue({} as WorkspaceService);
  render(NavBlockRowsEditor, {
    props: { journalName: "daily", field: "intervalBlock", title: TITLE, icon: "list" },
    global: {
      plugins: [{ install: (app) => provideInjectorOnApp(app, container) }],
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

describe("NavBlockRowsEditor", () => {
  it("hides the mode dropdown when mode is not enabled", async () => {
    mount([sampleRow]);
    await userEvent.click(screen.getByText(TITLE));
    expect(screen.queryByText(m.nav_block_section_mode_label())).toBeNull();
  });

  it("hides the use-defaults button when useDefaults is not enabled", async () => {
    mount([]);
    await userEvent.click(screen.getByText(TITLE));
    expect(screen.queryByText(m.nav_block_section_use_defaults({ writeType: "custom" }))).toBeNull();
  });

  it("invokes the flow with the intervalBlock field when 'add row' is clicked", async () => {
    const { invoke } = mount([sampleRow]);
    await userEvent.click(screen.getByText(TITLE));
    await userEvent.click(screen.getByLabelText(m.block_rows_add_row()));
    expect(invoke).toHaveBeenCalledWith(EditNavBlockRowFlow, { journalName: "daily", field: "intervalBlock" });
  });

  it("invokes the flow with the intervalBlock field and rowIndex when edit is clicked", async () => {
    const { invoke } = mount([sampleRow]);
    await userEvent.click(screen.getByText(TITLE));
    await userEvent.click(screen.getByLabelText(m.block_rows_edit_tooltip()));
    expect(invoke).toHaveBeenCalledWith(EditNavBlockRowFlow, {
      journalName: "daily",
      field: "intervalBlock",
      rowIndex: 0,
    });
  });

  it("removes a row from intervalBlock when its delete button is clicked", async () => {
    const { storage } = mount([sampleRow, { ...sampleRow, template: "{{date:MM}}" }]);
    await userEvent.click(screen.getByText(TITLE));
    const deleteButtons = screen.getAllByLabelText(m.block_rows_delete_tooltip());
    await userEvent.click(deleteButtons[0]);
    expect(storage.daily?.intervalBlock.rows.map((r) => r.template)).toEqual(["{{date:MM}}"]);
  });

  it("toggles decorateWholeBlock on intervalBlock", async () => {
    const { storage } = mount([sampleRow]);
    await userEvent.click(screen.getByText(TITLE));
    await userEvent.click(screen.getByRole("checkbox"));
    expect(storage.daily?.intervalBlock.decorateWholeBlock).toBe(true);
  });
});
