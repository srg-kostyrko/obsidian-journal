import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalendarDate } from "@/calendar";
import type { CalendarDecoration, DecorationOwner, JournalDecoration } from "@/decorations";
import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { JournalsIndex } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer } from "@/testing";

import { decorationsModule } from "../../module";
import { buildCondition, buildDecoration, buildStyle } from "../../testing";
import { decorationBreakdownModal } from "../../ui/modals";
import { DeleteDecorationFlow } from "../flows/delete-decoration.flow";
import { EditDecorationFlow } from "../flows/edit-decoration.flow";
import { decorationsSettingsCoreModule } from "../module";

import DecorationsSection from "./DecorationsSection.vue";

afterEach(() => {
  vi.useRealTimers();
});

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

// Seeds decorations only into the storage backing the owner under test, so a mismatched owner
// (e.g. a journal owner while a shelf has decorations) would surface as a genuine test failure.
async function mount(
  owner: DecorationOwner,
  decorations: readonly JournalDecoration[],
  options: { hasNote?: boolean } = {},
) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, decorationsModule, decorationsSettingsCoreModule],
    data: {
      journals: {
        daily: fixedJournal(
          "daily",
          { type: "day" },
          owner.kind === "journal" ? { decorations: [...decorations] } : {},
        ),
      },
      shelves: {
        work: buildShelf(
          "work",
          owner.kind === "shelf" ? { decorations: [...(decorations as CalendarDecoration[])] } : {},
        ),
      },
      decorations: { decorations: owner.kind === "global" ? [...(decorations as CalendarDecoration[])] : [] },
    },
  });

  if (options.hasNote) {
    const anchor = CalendarDate.today().toAnchor();
    const path = `Daily/${anchor}.md` as VaultPath;
    harness.host.putFile(path);
    harness.resolve(JournalsIndex).register({ journalName: "daily", anchor, path });
  }

  const flows = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue(AsyncResult.ok(undefined));

  harness.render(DecorationsSection, { props: { owner } });

  return { harness, flows };
}

describe("DecorationsSection", () => {
  it("renders the empty state when there are no decorations", async () => {
    await mount({ kind: "journal", journalName: "daily" }, []);
    await userEvent.click(screen.getByText(m.decoration_section_title_journal()));
    expect(screen.getByText(m.decoration_section_empty())).toBeTruthy();
  });

  it("renders a row description for each decoration", async () => {
    await mount({ kind: "journal", journalName: "daily" }, [sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title_journal()));
    expect(screen.getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
  });

  it("renders a preview swatch for each decoration", async () => {
    await mount({ kind: "journal", journalName: "daily" }, [sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title_journal()));
    // Every other row assertion targets describeCondition text, which renders regardless of
    // whether DecorationPreview resolves — an unresolved component still renders its slot
    // content as an unknown element. Assert on DecorationPreview's own testid so a dropped
    // import (which Vue only warns about, not throws on) fails this test.
    expect(screen.getByTestId("decoration-preview")).toBeTruthy();
  });

  it("invokes EditDecorationFlow with no index when Add is clicked", async () => {
    const { flows } = await mount({ kind: "journal", journalName: "daily" }, [sampleDecoration]);
    await userEvent.click(screen.getByLabelText(m.decoration_add()));
    expect(flows).toHaveBeenCalledWith(EditDecorationFlow, {
      owner: { kind: "journal", journalName: "daily" },
    });
  });

  it("invokes EditDecorationFlow with the index when Edit is clicked", async () => {
    const { flows } = await mount({ kind: "journal", journalName: "daily" }, [sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title_journal()));
    await userEvent.click(screen.getByLabelText(m.decoration_edit()));
    expect(flows).toHaveBeenCalledWith(EditDecorationFlow, {
      owner: { kind: "journal", journalName: "daily" },
      index: 0,
    });
  });

  it("invokes DeleteDecorationFlow when Delete is clicked", async () => {
    const { flows } = await mount({ kind: "journal", journalName: "daily" }, [sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title_journal()));
    await userEvent.click(screen.getByLabelText(m.decoration_delete()));
    expect(flows).toHaveBeenCalledWith(DeleteDecorationFlow, {
      owner: { kind: "journal", journalName: "daily" },
      index: 0,
    });
  });

  it("titles the section for a shelf owner", async () => {
    await mount({ kind: "shelf", shelfName: "work" }, [sampleCalendarDecoration]);
    expect(screen.getByText(m.decoration_section_title_shelf())).toBeTruthy();
  });

  it("lists a shelf's decorations", async () => {
    await mount({ kind: "shelf", shelfName: "work" }, [sampleCalendarDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title_shelf()));
    expect(screen.getAllByLabelText(m.decoration_edit())).toHaveLength(1);
  });

  it("invokes the edit flow with the global owner", async () => {
    const { flows } = await mount({ kind: "global" }, []);
    await userEvent.click(screen.getByLabelText(m.decoration_add()));
    expect(flows).toHaveBeenCalledWith(EditDecorationFlow, { owner: { kind: "global" } });
  });

  it("opens the breakdown modal from the inspect button", async () => {
    const { harness } = await mount({ kind: "journal", journalName: "daily" }, [sampleDecoration]);
    await userEvent.click(screen.getByLabelText(m.decoration_breakdown_open()));
    expect(harness.modals.lastOpen().definition).toBe(decorationBreakdownModal);
  });

  it("shows the match count on a decoration that fires", async () => {
    // A Monday-only decoration matches 13 of the last 90 days ending on the pinned Monday —
    // an implementation that reports the window total instead of the real match count (or
    // that never renders a badge at all) fails this.
    vi.useFakeTimers();
    // 2026-05-25 is a Monday.
    vi.setSystemTime(new Date(2026, 4, 25, 9, 0, 0));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const decoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("weekday", { weekdays: [1] })],
      styles: [buildStyle("background")],
    });
    await mount({ kind: "journal", journalName: "daily" }, [decoration]);
    await user.click(screen.getByText(m.decoration_section_title_journal()));

    expect(screen.getByText(m.decoration_badge_matched_past({ matched: 13, total: 90, unit: "day" }))).toBeTruthy();
  });

  it("shows the no-notes badge on a note-needing decoration with no notes in the window", async () => {
    // has-note is the only condition, and no note is registered in the index, so the row must
    // report "no notes yet" rather than misreading the empty index as a silent (0-match) badge.
    await mount({ kind: "journal", journalName: "daily" }, [sampleDecoration]);
    await userEvent.click(screen.getByText(m.decoration_section_title_journal()));

    expect(screen.getByText(m.decoration_badge_no_notes())).toBeTruthy();
  });

  it("renders no badge row for a note-size decoration", async () => {
    // The badge would need up to 90 unwarmed file reads with no reactive path to correct it,
    // so it goes silent — and the row must be absent entirely, not an empty line.
    const noteSizeDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("note-size", { condition: "gt", value: 100 })],
      styles: [buildStyle("background")],
    });
    await mount({ kind: "journal", journalName: "daily" }, [noteSizeDecoration], { hasNote: true });
    await userEvent.click(screen.getByText(m.decoration_section_title_journal()));

    expect(document.querySelector(".row-badge")).toBeNull();
  });
});
