import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { __testing as obsidianTesting } from "obsidian";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { initLocale, m } from "@/i18n";
import type { Note, VaultPath } from "@/infrastructure/host";
import { testContainer } from "@/testing";

import VaultDayNotesPanel from "./VaultDayNotesPanel.vue";

const note: Note = {
  path: "Folder/A note.md" as VaultPath,
  basename: "A note",
  folder: "Folder" as VaultPath,
  size: 0,
  ctime: new Date(2026, 4, 25).getTime(),
  mtime: new Date(2026, 4, 26, 14, 30).getTime(),
};

beforeAll(() => initLocale("en"));

describe("VaultDayNotesPanel", () => {
  it("renders compact metadata and opens a card in a new tab", async () => {
    const harness = await testContainer();
    harness.host.putFile(note.path);
    harness.render(VaultDayNotesPanel, {
      props: { notes: [note], sort: "modified-desc", includeJournals: true },
    });

    expect(screen.getByText("A note")).toBeTruthy();
    expect(screen.getByText(/Last modified May 26, 2026/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /A note/ }));

    expect(harness.host.workspace.openCalls.at(-1)).toEqual({ path: note.path, mode: "tab" });
  });

  it("orders the shelf badge before the rightmost journal badge", async () => {
    const harness = await testContainer();
    harness.render(VaultDayNotesPanel, {
      props: {
        notes: [{ ...note, journalName: "Daily", shelfName: "Work" }],
        sort: "modified-desc",
        includeJournals: true,
      },
    });

    const shelfBadge = screen.getByLabelText("Work");
    const journalBadge = screen.getByLabelText("Daily");
    expect(shelfBadge.nextElementSibling).toBe(journalBadge);
    expect(journalBadge.nextElementSibling).toBeNull();
  });

  it("shows a journal badge without a shelf badge when the journal belongs to no shelf", async () => {
    const harness = await testContainer();
    harness.render(VaultDayNotesPanel, {
      props: {
        notes: [{ ...note, journalName: "Daily" }],
        sort: "modified-desc",
        includeJournals: true,
      },
    });

    expect(screen.getByLabelText("Daily")).toBeTruthy();
    expect(screen.queryByLabelText("Work")).toBeNull();
  });

  it("shows no badges on an ordinary vault note", async () => {
    const harness = await testContainer();
    harness.render(VaultDayNotesPanel, {
      props: { notes: [note], sort: "modified-desc", includeJournals: true },
    });

    expect(screen.queryByLabelText("Daily")).toBeNull();
    expect(screen.queryByLabelText("Work")).toBeNull();
  });

  it("emits close from the cross button", async () => {
    const harness = await testContainer();
    const onClose = vi.fn();
    harness.render(VaultDayNotesPanel, {
      props: { notes: [note], sort: "modified-desc", includeJournals: true, onClose },
    });

    await userEvent.click(screen.getByRole("button", { name: m.calendar_noteview_close() }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("truncates card titles longer than 80 characters", async () => {
    const harness = await testContainer();
    const basename = "A".repeat(81);
    harness.render(VaultDayNotesPanel, {
      props: { notes: [{ ...note, basename }], sort: "modified-desc", includeJournals: true },
    });

    expect(screen.getByText(`${"A".repeat(79)}…`)).toBeTruthy();
  });

  it("shows an error notice when a card's note cannot be opened", async () => {
    const harness = await testContainer();
    harness.render(VaultDayNotesPanel, {
      props: { notes: [note], sort: "modified-desc", includeJournals: true },
    });

    await userEvent.click(screen.getByRole("button", { name: /A note/ }));

    await vi.waitFor(() => expect(harness.notices.messages).toContain(m.common_note_open_error()));
  });

  it("uses icon controls for the sort field and direction", async () => {
    const harness = await testContainer();
    const onSortUpdate = vi.fn();
    harness.render(VaultDayNotesPanel, {
      props: { notes: [note], sort: "modified-desc", includeJournals: true, "onUpdate:sort": onSortUpdate },
    });

    const sortButton = screen.getByRole("button", { name: m.calendar_noteview_sort_label() });
    expect(sortButton.getAttribute("aria-haspopup")).toBe("menu");
    await userEvent.click(sortButton);
    const menu = obsidianTesting.lastOpenMenu();
    expect(menu.items.map((item) => item.title)).toEqual([
      m.calendar_noteview_sort_modified(),
      m.calendar_noteview_sort_name(),
    ]);
    (menu.items[1] as unknown as { click(): void }).click();
    expect(onSortUpdate).toHaveBeenCalledWith("name-desc");

    await userEvent.click(screen.getByRole("button", { name: m.calendar_noteview_sort_descending() }));
    expect(onSortUpdate).toHaveBeenCalledWith("modified-asc");
  });

  it("switches ascending name sorting to modified sorting and descending order", async () => {
    const harness = await testContainer();
    const onSortUpdate = vi.fn();
    harness.render(VaultDayNotesPanel, {
      props: { notes: [note], sort: "name-asc", includeJournals: true, "onUpdate:sort": onSortUpdate },
    });

    await userEvent.click(screen.getByRole("button", { name: m.calendar_noteview_sort_label() }));
    const menu = obsidianTesting.lastOpenMenu();
    (menu.items[0] as unknown as { click(): void }).click();
    expect(onSortUpdate).toHaveBeenCalledWith("modified-asc");

    await userEvent.click(screen.getByRole("button", { name: m.calendar_noteview_sort_ascending() }));
    expect(onSortUpdate).toHaveBeenCalledWith("name-desc");
  });

  it("uses a pressed icon toggle for globally including journal notes", async () => {
    const harness = await testContainer();
    const onIncludeJournalsUpdate = vi.fn();
    harness.render(VaultDayNotesPanel, {
      props: {
        notes: [note],
        sort: "modified-desc",
        includeJournals: true,
        "onUpdate:includeJournals": onIncludeJournalsUpdate,
      },
    });

    const toggle = screen.getByRole("button", { name: m.calendar_noteview_include_journals_label() });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(toggle);
    expect(onIncludeJournalsUpdate).toHaveBeenCalledWith(false);
  });

  it("shows an unpressed journal toggle when journal notes are globally excluded", async () => {
    const harness = await testContainer();
    const onIncludeJournalsUpdate = vi.fn();
    harness.render(VaultDayNotesPanel, {
      props: {
        notes: [note],
        sort: "modified-desc",
        includeJournals: false,
        "onUpdate:includeJournals": onIncludeJournalsUpdate,
      },
    });

    const toggle = screen.getByRole("button", { name: m.calendar_noteview_include_journals_label() });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(toggle);
    expect(onIncludeJournalsUpdate).toHaveBeenCalledWith(true);
  });

  it("emits previous and next navigation from chevrons beside the journal toggle", async () => {
    const harness = await testContainer();
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    harness.render(VaultDayNotesPanel, {
      props: {
        notes: [note],
        sort: "modified-desc",
        includeJournals: true,
        onPrevious,
        onNext,
      },
    });

    await userEvent.click(screen.getByRole("button", { name: m.calendar_noteview_previous_day() }));
    await userEvent.click(screen.getByRole("button", { name: m.calendar_noteview_next_day() }));

    expect(onPrevious).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("renders five complete card slots before scrolling", async () => {
    const harness = await testContainer();
    const notes = Array.from({ length: 5 }, (_, index) => ({
      ...note,
      path: `Folder/Note ${index}.md` as VaultPath,
      basename: `Note ${index}`,
    }));
    harness.render(VaultDayNotesPanel, {
      props: { notes, sort: "modified-desc", includeJournals: true },
    });

    expect(screen.getAllByRole("button", { name: /^Note \d/ })).toHaveLength(5);
  });
});
