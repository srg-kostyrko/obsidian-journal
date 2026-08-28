import { fireEvent, screen } from "@testing-library/vue";
import { __testing as obsidianTesting } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref, type Ref } from "vue";

import { localMoment, type AnchorString } from "@/calendar";
import { m } from "@/i18n";
import { WorkspaceOpenError, WorkspaceService, type OpenMode, type VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { JournalsIndex } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer, type TestHarness } from "@/testing";
import { icons } from "@/ui/icons";

import { UnknownViewError } from "../../errors";
import { viewsCoreModule } from "../../module";
import { ViewsService } from "../../service";
import { buildView, provideViewContextStub } from "../../testing";
import { provideViewContext, type ViewContext } from "../../view-context";

import { dayNotesBlock, type DayNotesBlockConfig } from "./day-notes-block";
import dayNotesBlockSource from "./ui/DayNotesBlock.vue?raw";

import type { BlockInstanceId, ViewId } from "../../config";

const VIEW_ID = "33333333-3333-4333-8333-333333333333" as ViewId;
const BLOCK_ID = "44444444-4444-4444-8444-444444444444" as BlockInstanceId;
const defaultConfig: DayNotesBlockConfig = {
  granularity: "day",
  sortField: "modified",
  sortDirection: "desc",
  showHeading: true,
  showNavigation: false,
};

interface NoteSeed {
  readonly path: string;
  readonly created: string;
  readonly modified?: string;
}

function seedNote(harness: TestHarness, seed: NoteSeed): void {
  const ctime = localMoment(seed.created, "YYYY-MM-DD", true).valueOf();
  const mtime = localMoment(seed.modified ?? `${seed.created} 00:00`, "YYYY-MM-DD HH:mm", true).valueOf();
  const file = harness.host.putFile(seed.path, "", { created: seed.created });
  Object.assign(file.stat, { ctime, mtime });
}

async function mountBlock(
  options: {
    notes?: readonly NoteSeed[];
    config?: DayNotesBlockConfig;
    context?: Partial<ViewContext>;
    shelves?: Record<string, ReturnType<typeof buildShelf>>;
  } = {},
) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule],
    data: {
      journals: {},
      shelves: options.shelves ?? {},
      views: {
        [VIEW_ID]: buildView(VIEW_ID, {
          blocks: [{ id: BLOCK_ID, key: dayNotesBlock.key, config: options.config ?? defaultConfig }],
        }),
      },
      dayNotes: {},
    },
  });
  const noteSeeds = options.notes ?? [];
  for (const note of noteSeeds) seedNote(harness, note);

  const refDate: Readonly<Ref<AnchorString>> =
    options.context?.refDate ?? ref<AnchorString>("2026-05-15" as AnchorString);
  const config = ref(options.config ?? defaultConfig);
  const context = provideViewContextStub({ viewId: VIEW_ID, refDate, ...options.context });
  const renderBlock = () => h(dayNotesBlock.component, { instanceId: BLOCK_ID, config: config.value });
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderBlock;
    },
  });
  const result = harness.render(Wrapper);
  return { ...result, harness, refDate, config };
}

function cardTitles(container: Element): string[] {
  return [...container.querySelectorAll<HTMLElement>(".journal-view-day-notes__title")].map(
    (element) => element.textContent?.trim() ?? "",
  );
}

function clickMenuItem(title: string): void {
  const item = obsidianTesting.lastOpenMenu().items.find((candidate) => candidate.title === title);
  if (!item) throw new Error(`No menu item named ${title}`);
  (item as unknown as { click(): void }).click();
}

function menuItem(title: string): ReturnType<typeof obsidianTesting.lastOpenMenu>["items"][number] {
  const item = obsidianTesting.lastOpenMenu().items.find((candidate) => candidate.title === title);
  if (!item) throw new Error(`No menu item named ${title}`);
  return item;
}

beforeEach(() => {
  obsidianTesting.reset();
  obsidianTesting.seedIcons([icons.nav.prev, icons.nav.next, icons.action.sortAscending, icons.action.sortDescending]);
});

afterEach(() => obsidianTesting.resetIcons());

describe("DayNotesBlock", () => {
  it("renders only notes created on refDate at day granularity", async () => {
    const { container } = await mountBlock({
      notes: [
        { path: "Selected.md", created: "2026-05-15" },
        { path: "Other.md", created: "2026-05-16" },
      ],
    });
    expect(cardTitles(container)).toEqual(["Selected"]);
  });

  it("uses the configured period granularity", async () => {
    const { container } = await mountBlock({
      config: { ...defaultConfig, granularity: "month", sortField: "name", sortDirection: "asc" },
      notes: [
        { path: "A.md", created: "2026-05-01" },
        { path: "B.md", created: "2026-05-31" },
        { path: "C.md", created: "2026-06-01" },
      ],
    });
    expect(cardTitles(container)).toEqual(["A", "B"]);
  });

  it("reacts when viewContext.refDate changes", async () => {
    const refDate = ref("2026-05-15" as AnchorString);
    const { container } = await mountBlock({
      context: { refDate },
      notes: [
        { path: "First.md", created: "2026-05-15" },
        { path: "Second.md", created: "2026-05-16" },
      ],
    });
    expect(cardTitles(container)).toEqual(["First"]);
    refDate.value = "2026-05-16" as AnchorString;
    await nextTick();
    expect(cardTitles(container)).toEqual(["Second"]);
  });

  it("sorts by name and modification time in either direction", async () => {
    const { container, config } = await mountBlock({
      config: { ...defaultConfig, sortField: "name", sortDirection: "asc" },
      notes: [
        { path: "A-old.md", created: "2026-05-15", modified: "2026-05-15 08:00" },
        { path: "Z-new.md", created: "2026-05-15", modified: "2026-05-15 18:00" },
      ],
    });
    expect(cardTitles(container)).toEqual(["A-old", "Z-new"]);

    config.value = { ...config.value, sortDirection: "desc" };
    await nextTick();
    expect(cardTitles(container)).toEqual(["Z-new", "A-old"]);

    config.value = { ...config.value, sortField: "modified", sortDirection: "desc" };
    await nextTick();
    expect(cardTitles(container)).toEqual(["Z-new", "A-old"]);

    config.value = { ...config.value, sortDirection: "asc" };
    await nextTick();
    expect(cardTitles(container)).toEqual(["A-old", "Z-new"]);
  });

  it("sorts by resolved creation date at coarser granularity", async () => {
    const { container, config } = await mountBlock({
      config: { ...defaultConfig, granularity: "month", sortField: "created", sortDirection: "asc" },
      notes: [
        { path: "A-late.md", created: "2026-05-20" },
        { path: "Z-early.md", created: "2026-05-02" },
      ],
    });
    expect(cardTitles(container)).toEqual(["Z-early", "A-late"]);
    config.value = { ...config.value, sortDirection: "desc" };
    await nextTick();
    expect(cardTitles(container)).toEqual(["A-late", "Z-early"]);
  });

  it("shows a period heading by default and hides it when configured", async () => {
    const { container, config } = await mountBlock();
    expect(container.querySelector(".journal-view-day-notes__heading")?.textContent).toContain("2026");
    config.value = { ...config.value, showHeading: false };
    await nextTick();
    expect(container.querySelector(".journal-view-day-notes__heading")).toBeNull();
  });

  it("keeps period navigation opt-in and independent of the heading", async () => {
    await mountBlock();
    expect(
      screen.queryByRole("button", { name: m.view_toolbar_button_default_tooltip_prev_unit({ unit: "day" }) }),
    ).toBeNull();

    const { container: navigationContainer } = await mountBlock({
      config: { ...defaultConfig, showHeading: false, showNavigation: true },
    });
    expect(navigationContainer.querySelector(".journal-view-day-notes__heading")).toBeNull();
    const previous = screen.getByRole("button", {
      name: m.view_toolbar_button_default_tooltip_prev_unit({ unit: "day" }),
    });
    const next = screen.getByRole("button", {
      name: m.view_toolbar_button_default_tooltip_next_unit({ unit: "day" }),
    });
    expect(previous.querySelector("svg")?.dataset.icon).toBe("chevron-left");
    expect(next.querySelector("svg")?.dataset.icon).toBe("chevron-right");
  });

  it("steps by the block's live granularity through navigate-step controls", async () => {
    const setRefDate = vi.fn();
    const { config } = await mountBlock({
      config: { ...defaultConfig, showNavigation: true },
      context: { setRefDate },
    });

    await fireEvent.click(
      screen.getByRole("button", { name: m.view_toolbar_button_default_tooltip_next_unit({ unit: "day" }) }),
    );
    expect(setRefDate).toHaveBeenLastCalledWith("2026-05-16");

    config.value = { ...config.value, granularity: "month" };
    await nextTick();
    await fireEvent.click(
      screen.getByRole("button", { name: m.view_toolbar_button_default_tooltip_next_unit({ unit: "month" }) }),
    );
    expect(setRefDate).toHaveBeenLastCalledWith("2026-06-15");

    config.value = { ...config.value, granularity: "decade" };
    await nextTick();
    const previousDecade = screen.getByRole("button", {
      name: m.view_toolbar_button_default_tooltip_prev_unit({ unit: "decade" }),
    });
    expect(previousDecade.querySelector("svg")?.dataset.icon).toBe("chevron-left");
    await fireEvent.click(previousDecade);
    expect(setRefDate).toHaveBeenLastCalledWith("2016-05-15");
  });

  it("shows the empty state", async () => {
    await mountBlock();
    expect(screen.getByText(m.view_block_day_notes_empty())).toBeTruthy();
  });

  it("reserves the creation row and keeps modification time last at every granularity", async () => {
    const { container, config } = await mountBlock({
      notes: [{ path: "Note.md", created: "2026-05-15", modified: "2026-05-15 18:00" }],
    });
    const metadataText = () =>
      [...container.querySelectorAll<HTMLElement>(".journal-view-day-notes__metadata")].map(
        (element) => element.textContent?.trim() ?? "",
      );
    expect(metadataText()).toEqual(["", expect.stringContaining("Last modified:")]);
    expect(container.textContent).toContain("Last modified:");
    expect(container.textContent).not.toContain("Created:");

    config.value = { ...config.value, granularity: "month" };
    await nextTick();
    expect(metadataText()).toEqual([expect.stringContaining("Created:"), expect.stringContaining("Last modified:")]);
  });

  it("shows journal and shelf badges without filtering any notes", async () => {
    const { container, harness } = await mountBlock({
      notes: [
        { path: "Ordinary.md", created: "2026-05-15" },
        { path: "Daily.md", created: "2026-05-15" },
      ],
      shelves: { Personal: buildShelf("Personal", { journals: ["daily"] }) },
      context: { shelf: ref("Work") },
    });
    harness.resolve(JournalsIndex).register({
      path: "Daily.md" as VaultPath,
      journalName: "daily",
      anchor: "2026-05-15" as AnchorString,
    });
    await nextTick();

    expect(cardTitles(container).toSorted()).toEqual(["Daily", "Ordinary"]);
    expect(screen.getByLabelText("daily")).toBeTruthy();
    expect(screen.getByLabelText("Personal")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /journal notes/i })).toBeNull();
  });

  it("adds badges when a note is indexed after the block mounts", async () => {
    const { harness } = await mountBlock({ notes: [{ path: "Daily.md", created: "2026-05-15" }] });
    expect(screen.queryByLabelText("daily")).toBeNull();

    harness.resolve(JournalsIndex).register({
      path: "Daily.md" as VaultPath,
      journalName: "daily",
      anchor: "2026-05-15" as AnchorString,
    });

    expect(await screen.findByLabelText("daily")).toBeTruthy();
  });

  it("persists live granularity, sort-field and sort-direction controls for this view and block", async () => {
    const { harness } = await mountBlock();
    const update = vi.spyOn(harness.resolve(ViewsService), "updateBlockConfig").mockReturnValue(AsyncResult.ok());

    await fireEvent.click(screen.getByRole("button", { name: m.view_block_day_notes_granularity_label() }));
    clickMenuItem(m.view_block_day_notes_granularity_option({ kind: "month" }));
    expect(update).toHaveBeenLastCalledWith(VIEW_ID, BLOCK_ID, { ...defaultConfig, granularity: "month" });

    await fireEvent.click(screen.getByRole("button", { name: m.view_block_day_notes_sort_field_label() }));
    clickMenuItem(m.view_block_day_notes_sort_created());
    expect(update).toHaveBeenLastCalledWith(VIEW_ID, BLOCK_ID, { ...defaultConfig, sortField: "created" });

    await fireEvent.click(screen.getByRole("button", { name: m.view_block_day_notes_sort_descending() }));
    expect(update).toHaveBeenLastCalledWith(VIEW_ID, BLOCK_ID, { ...defaultConfig, sortDirection: "asc" });
  });

  it("notifies when a live control cannot persist its config", async () => {
    const { harness } = await mountBlock();
    vi.spyOn(harness.resolve(ViewsService), "updateBlockConfig").mockReturnValue(
      AsyncResult.err(new UnknownViewError(VIEW_ID)),
    );

    await fireEvent.click(screen.getByRole("button", { name: m.view_block_day_notes_sort_descending() }));

    await vi.waitFor(() => expect(harness.notices.messages).toContain(m.view_block_day_notes_update_error()));
  });

  it("uses native checked states for the selected period and sort field", async () => {
    await mountBlock();

    await fireEvent.click(screen.getByRole("button", { name: m.view_block_day_notes_granularity_label() }));
    expect(menuItem(m.view_block_day_notes_granularity_option({ kind: "day" })).checked).toBe(true);
    expect(menuItem(m.view_block_day_notes_granularity_option({ kind: "month" })).checked).toBe(false);

    await fireEvent.click(screen.getByRole("button", { name: m.view_block_day_notes_sort_field_label() }));
    expect(menuItem(m.view_block_day_notes_sort_modified()).checked).toBe(true);
    expect(menuItem(m.view_block_day_notes_sort_name()).checked).toBe(false);
  });

  it("renders a supported icon for the separate sort-direction control", async () => {
    const { config } = await mountBlock();
    const descending = screen.getByRole("button", { name: m.view_block_day_notes_sort_descending() });
    expect(descending.querySelector("svg")?.dataset.icon).toBe("arrow-down");

    config.value = { ...config.value, sortDirection: "asc" };
    await nextTick();
    const ascending = screen.getByRole("button", { name: m.view_block_day_notes_sort_ascending() });
    expect(ascending.querySelector("svg")?.dataset.icon).toBe("arrow-up");
  });

  it("keeps cards compact without clipping their content or top-right badges", async () => {
    const { container, harness } = await mountBlock({
      notes: [{ path: "Daily.md", created: "2026-05-15" }],
      shelves: { Personal: buildShelf("Personal", { journals: ["daily"] }) },
    });
    harness.resolve(JournalsIndex).register({
      path: "Daily.md" as VaultPath,
      journalName: "daily",
      anchor: "2026-05-15" as AnchorString,
    });
    await nextTick();

    const card = container.querySelector<HTMLElement>(".journal-view-day-notes__card");
    const badges = container.querySelector<HTMLElement>(".journal-view-day-notes__badges");
    expect(card).not.toBeNull();
    expect(badges).not.toBeNull();
    expect(dayNotesBlockSource).toContain("min-height: 84px;");
    expect(dayNotesBlockSource).toContain(".journal-view-day-notes__created");
    expect(dayNotesBlockSource).toContain("overflow: visible;");
    expect(dayNotesBlockSource).toContain("z-index: 1;");
  });

  it("uses native open modes for primary, Mod and middle clicks", async () => {
    const { harness } = await mountBlock({ notes: [{ path: "Note.md", created: "2026-05-15" }] });
    const open = vi
      .spyOn(harness.resolve(WorkspaceService), "openNote")
      .mockImplementation((_path: VaultPath, _mode: OpenMode = "active") => AsyncResult.ok());
    const card = screen.getByRole("button", { name: /Note/ });

    await fireEvent.click(card);
    expect(open).toHaveBeenLastCalledWith("Note.md", "active");
    await fireEvent.click(card, { metaKey: true });
    expect(open).toHaveBeenLastCalledWith("Note.md", "tab");
    void fireEvent(card, new MouseEvent("auxclick", { button: 1, bubbles: true }));
    expect(open).toHaveBeenLastCalledWith("Note.md", "tab");
  });

  it("notifies when a card cannot be opened", async () => {
    const { harness } = await mountBlock({ notes: [{ path: "Note.md", created: "2026-05-15" }] });
    vi.spyOn(harness.resolve(WorkspaceService), "openNote").mockReturnValueOnce(
      AsyncResult.err(new WorkspaceOpenError("Note.md" as VaultPath, "gone")),
    );

    await fireEvent.click(screen.getByRole("button", { name: /Note/ }));

    await vi.waitFor(() => expect(harness.notices.messages).toContain(m.common_note_open_error()));
  });
});
