import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ModalService, type ModalApi } from "@/infrastructure/host/modals";
import { FakeModalService, provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
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
import { ShelvesRepository, type ShelfConfig, type ShelvesEvents } from "@/shelves";
import { TemplateEngine } from "@/templates";

import EditNavBlockSegmentModal from "./EditNavBlockSegmentModal.vue";

afterEach(() => cleanup());

function mountModal(options: {
  segment?: NavBlockSegment;
  journals?: Record<string, JournalConfig>;
  shelves?: Record<string, ShelfConfig>;
}) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<{ segment: NavBlockSegment }> = { submit, cancel };
  const container = new Container();
  const journalsStorage = reactive(options.journals ?? { daily: journalDefaultsFor({ type: "day" }, "daily") });
  const shelvesStorage = reactive(options.shelves ?? { home: { name: "home", journals: ["daily"], decorations: [] } });
  const repo = JournalsRepository.fromParts(journalsStorage, createNanoEvents<JournalsEvents>());
  const shelvesRepo = ShelvesRepository.fromParts(shelvesStorage, createNanoEvents<ShelvesEvents>());
  container.register(JournalsRepository).useValue(repo);
  container.register(JournalsViewModel).useValue(JournalsViewModel.fromRepository(repo));
  container.register(ShelvesRepository).useValue(shelvesRepo);
  container.register(Calendar).useValue(new Calendar());
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(TemplateEngine).useClass(TemplateEngine);
  container.register(CycleService).useClass(CycleService);
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(NumberingService).useClass(NumberingService);
  container.register(FrontmatterService).useClass(FrontmatterService);
  container.register(NotePathService).useClass(NotePathService);
  render(EditNavBlockSegmentModal, {
    props: { journalName: "daily", segment: options.segment },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
            provideModalApiOnApp(app, api as ModalApi<unknown>);
          },
        },
      ],
    },
  });
  return { submit, cancel };
}

function baseSegment(overrides: Partial<NavBlockSegment> = {}): NavBlockSegment {
  return {
    template: "",
    fontSize: 1,
    bold: false,
    italic: false,
    color: { type: "theme", name: "text-normal" },
    background: { type: "transparent" },
    link: "none",
    journal: "",
    linkDate: "",
    addDecorations: false,
    ...overrides,
  };
}

describe("EditNavBlockSegmentModal", () => {
  it("opens blank when segment prop is undefined", () => {
    mountModal({});
    const input = screen.getByLabelText<HTMLInputElement>(m.nav_block_segment_field_template());
    expect(input.value).toBe("");
  });

  it("opens with pre-filled values when a segment is provided", () => {
    mountModal({
      segment: {
        template: "{{date:YYYY}}",
        fontSize: 1.5,
        bold: true,
        italic: false,
        color: { type: "theme", name: "text-normal" },
        background: { type: "transparent" },
        link: "year",
        journal: "",
        linkDate: "",
        addDecorations: true,
      },
    });
    const input = screen.getByLabelText<HTMLInputElement>(m.nav_block_segment_field_template());
    expect(input.value).toBe("{{date:YYYY}}");
  });

  it("does not submit when template is empty", async () => {
    const { submit } = mountModal({});
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => {
      expect(screen.getByText(m.nav_block_segment_template_required())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits when template is present", async () => {
    const { submit } = mountModal({});
    await userEvent.type(screen.getByLabelText(m.nav_block_segment_field_template()), "{{{{date:YYYY}}");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ segment: { template: "{{date:YYYY}}" } });
  });

  it("submits a bold segment when the bold text style is toggled on", async () => {
    const { submit } = mountModal({});
    await userEvent.type(screen.getByLabelText(m.nav_block_segment_field_template()), "x");
    await userEvent.click(screen.getByRole("button", { name: m.nav_block_segment_field_bold() }));
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ segment: { bold: true, italic: false } });
  });

  it("marks the italic text style as pressed for a segment that is already italic", () => {
    mountModal({
      segment: {
        template: "{{date:YYYY}}",
        fontSize: 1,
        bold: false,
        italic: true,
        color: { type: "theme", name: "text-normal" },
        background: { type: "transparent" },
        link: "none",
        journal: "",
        linkDate: "",
        addDecorations: false,
      },
    });
    expect(screen.getByRole("button", { name: m.nav_block_segment_field_italic(), pressed: true })).toBeTruthy();
  });

  it("does not submit when link=journal but journal is empty", async () => {
    const { submit } = mountModal({});
    await userEvent.type(screen.getByLabelText(m.nav_block_segment_field_template()), "x");
    await userEvent.selectOptions(screen.getByLabelText(m.nav_block_segment_field_link()), "journal");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => {
      expect(screen.getByText(m.nav_block_segment_journal_required())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("hides the journal dropdown when link is not 'journal'", () => {
    mountModal({});
    expect(screen.queryByLabelText(m.common_label_journal())).toBeNull();
  });

  it("shows shelf-mates excluding the current journal in the journal dropdown", async () => {
    mountModal({
      journals: {
        daily: journalDefaultsFor({ type: "day" }, "daily"),
        weekly: journalDefaultsFor({ type: "week" }, "weekly"),
      },
      shelves: { home: { name: "home", journals: ["daily", "weekly"], decorations: [] } },
    });
    await userEvent.selectOptions(screen.getByLabelText(m.nav_block_segment_field_link()), "journal");
    const dropdown = await screen.findByLabelText<HTMLSelectElement>(m.common_label_journal());
    const optionValues = [...dropdown.options].map((option) => option.value);
    expect(optionValues).toContain("weekly");
    expect(optionValues).not.toContain("daily");
  });

  it("cancels via api.cancel when the cancel button is clicked", async () => {
    const { cancel } = mountModal({});
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalled();
  });

  it("shows the link date field for a period link", () => {
    mountModal({ segment: baseSegment({ link: "quarter" }) });
    expect(screen.getByLabelText(m.nav_block_segment_field_link_date())).toBeTruthy();
  });

  it("hides the link date field when the link is none", () => {
    mountModal({ segment: baseSegment({ link: "none" }) });
    expect(screen.queryByLabelText(m.nav_block_segment_field_link_date())).toBeNull();
  });

  it("reports an unparsable link date", async () => {
    const { submit } = mountModal({ segment: baseSegment({ link: "quarter", template: "x" }) });
    await userEvent.type(screen.getByLabelText(m.nav_block_segment_field_link_date()), "nonsense");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(screen.getByText(m.nav_block_segment_link_date_invalid())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("accepts a valid link date", async () => {
    const { submit } = mountModal({ segment: baseSegment({ link: "quarter", template: "x" }) });
    await userEvent.type(screen.getByLabelText(m.nav_block_segment_field_link_date()), "+1q");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ segment: { linkDate: "+1q" } });
  });
});
