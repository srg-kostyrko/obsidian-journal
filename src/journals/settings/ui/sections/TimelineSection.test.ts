import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { DayPeriod, type OpenInterval } from "@/calendar";
import { anchor, date } from "@/calendar/testing";
import { m } from "@/i18n";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import TimelineSection from "./TimelineSection.vue";

describe("TimelineSection", () => {
  describe("timeline.start DatePicker", () => {
    it("writes the picked date to timeline.start", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                timeline: { start: anchor("2024-01-01"), end: { kind: "never" } },
              },
            ),
          },
        },
      });
      harness.render(TimelineSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_timeline()));
      await userEvent.click(screen.getByRole("button", { name: "2024-01-01" }));
      harness.modals.lastOpen<unknown, DayPeriod>().submit(DayPeriod.containing(date("2025-03-15")));

      await waitFor(() => {
        expect(harness.resolve(JournalsRepository).get("daily").getOrUndefined()?.timeline.start).toBe("2025-03-15");
      });
    });
  });

  describe("clear start button", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                timeline: { start: anchor("2024-01-01"), end: { kind: "never" } },
              },
            ),
          },
        },
      });
      harness.render(TimelineSection, { props: { journalName: "daily" } });
    });

    it("names itself for what it clears rather than as a close button", async () => {
      await userEvent.click(screen.getByText(m.journal_edit_section_timeline()));

      expect(screen.getByRole("button", { name: m.journal_edit_clear_start_tooltip() })).toBeTruthy();
    });

    it("clears timeline.start when clicked", async () => {
      await userEvent.click(screen.getByText(m.journal_edit_section_timeline()));
      await userEvent.click(screen.getByRole("button", { name: m.journal_edit_clear_start_tooltip() }));

      await waitFor(() => {
        expect(harness.resolve(JournalsRepository).get("daily").getOrUndefined()?.timeline.start).toBe("");
      });
    });
  });

  describe("timeline.end.date DatePicker", () => {
    it("writes the picked date to timeline.end.date", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                timeline: { start: anchor("2024-01-01"), end: { kind: "date", date: anchor("2024-06-01") } },
              },
            ),
          },
        },
      });
      harness.render(TimelineSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_timeline()));
      await userEvent.click(screen.getByRole("button", { name: "2024-06-01" }));
      harness.modals.lastOpen<unknown, DayPeriod>().submit(DayPeriod.containing(date("2025-06-01")));

      await waitFor(() => {
        const end = harness.resolve(JournalsRepository).get("daily").getOrUndefined()?.timeline.end;
        expect(end?.kind === "date" ? end.date : null).toBe("2025-06-01");
      });
    });

    it("bounds the end-date picker to start when start is set", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                timeline: { start: anchor("2025-03-15"), end: { kind: "date", date: anchor("2025-06-01") } },
              },
            ),
          },
        },
      });
      harness.render(TimelineSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_timeline()));
      await userEvent.click(screen.getByRole("button", { name: "2025-06-01" }));

      const boundsStart = harness.modals.lastOpen<{ bounds?: OpenInterval }, DayPeriod>().props.bounds?.start;
      expect(boundsStart?.isSome()).toBe(true);
      expect(boundsStart?.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2025-03-15");
    });
  });

  describe("repeats end mode", () => {
    it("warns to set a start date when ending after repeats with no start", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                timeline: { start: anchor(""), end: { kind: "repeats", count: 3 } },
              },
            ),
          },
        },
      });
      harness.render(TimelineSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_timeline()));

      expect(screen.getByText(m.journal_edit_end_repeats_needs_start_warning())).toBeTruthy();
    });

    it("omits the start-date warning when a start date is set", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                timeline: { start: anchor("2024-01-01"), end: { kind: "repeats", count: 3 } },
              },
            ),
          },
        },
      });
      harness.render(TimelineSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_timeline()));

      expect(screen.queryByText(m.journal_edit_end_repeats_needs_start_warning())).toBeNull();
    });
  });
});
