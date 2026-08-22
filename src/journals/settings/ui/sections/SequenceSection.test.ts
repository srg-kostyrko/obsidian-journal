import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DayPeriod } from "@/calendar";
import { anchor, date } from "@/calendar/testing";
import { formatConjunction, m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { JournalsRepository } from "@/journals";
import type { JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { EditNumberingDigitFlow } from "../../flows/edit-numbering-digit.flow";

import SequenceSection from "./SequenceSection.vue";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-19T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

function enabledNumbering(variables: readonly string[]): JournalConfig["numbering"] {
  return {
    enabled: true,
    anchorDate: anchor("2026-01-05"),
    allowBefore: false,
    sources: variables.map((variable, i) => ({
      variable,
      frontmatterKey: `journal-${variable}`,
      anchorValue: 1,
      reset: i === 0 ? ({ kind: "never" } as const) : ({ kind: "after", count: 6 } as const),
    })),
  };
}

function numberingOf(harness: TestHarness): JournalConfig["numbering"] | undefined {
  return harness.resolve(JournalsRepository).get("daily").getOrUndefined()?.numbering;
}

describe("SequenceSection", () => {
  describe("sequence toggle", () => {
    it("materializes the default source when sequential numbers is toggled on", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                numbering: { enabled: false, anchorDate: anchor("2024-01-01"), allowBefore: false, sources: [] },
              },
            ),
          },
        },
      });
      harness.render(SequenceSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));
      await userEvent.click(screen.getByRole("checkbox"));

      expect(numberingOf(harness)?.sources).toHaveLength(1);
      expect(numberingOf(harness)?.enabled).toBe(true);
    });
  });

  describe("allow-before toggle", () => {
    it("hides the allow-before toggle when start date is set", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                timeline: { start: anchor("2024-01-01"), end: { kind: "never" } },
                numbering: {
                  enabled: true,
                  anchorDate: anchor("2024-01-01"),
                  allowBefore: false,
                  sources: [
                    { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
                  ],
                },
              },
            ),
          },
        },
      });
      harness.render(SequenceSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));

      expect(screen.queryByText(m.journal_edit_allow_before_label())).toBeNull();
    });
  });

  describe("anchor help text", () => {
    it("shows the anchor description when no start date is set", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                timeline: { start: anchor(""), end: { kind: "never" } },
                numbering: {
                  enabled: true,
                  anchorDate: anchor("2024-01-01"),
                  allowBefore: false,
                  sources: [
                    { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
                  ],
                },
              },
            ),
          },
        },
      });
      harness.render(SequenceSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));

      expect(screen.getByText(m.journal_edit_anchor_description())).toBeDefined();
    });
  });

  describe("numbering anchor DatePicker", () => {
    it("writes the picked date to numbering.anchorDate", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                timeline: { start: anchor(""), end: { kind: "never" } },
                numbering: {
                  enabled: true,
                  anchorDate: anchor("2024-01-01"),
                  allowBefore: false,
                  sources: [
                    { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
                  ],
                },
              },
            ),
          },
        },
      });
      harness.render(SequenceSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));
      await userEvent.click(screen.getByRole("button", { name: "2024-01-01" }));
      harness.modals.lastOpen<unknown, DayPeriod>().submit(DayPeriod.containing(date("2025-01-10")));

      await waitFor(() => {
        expect(numberingOf(harness)?.anchorDate).toBe("2025-01-10");
      });
    });
  });

  describe("digit list", () => {
    it("renders one row per digit", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                numbering: {
                  enabled: true,
                  anchorDate: anchor("2026-01-05"),
                  allowBefore: false,
                  sources: [
                    {
                      variable: "release",
                      frontmatterKey: "journal-release",
                      anchorValue: 4711,
                      reset: { kind: "never" },
                    },
                    {
                      variable: "sprint",
                      frontmatterKey: "journal-sprint",
                      anchorValue: 1,
                      reset: { kind: "after", count: 6 },
                    },
                  ],
                },
              },
            ),
          },
        },
      });
      harness.render(SequenceSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));

      expect(await screen.findByText("release")).toBeTruthy();
      expect(await screen.findByText("sprint")).toBeTruthy();
    });

    describe("with a single digit", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: {
            journals: { daily: fixedJournal("daily", { type: "day" }, { numbering: enabledNumbering(["index"]) }) },
          },
        });
        harness.render(SequenceSection, { props: { journalName: "daily" } });
      });

      it("invokes the digit flow with no index when adding", async () => {
        const invoke = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue({} as never);
        await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));

        await userEvent.click(screen.getByLabelText(m.journal_sequence_digit_add()));

        expect(invoke).toHaveBeenCalledWith(EditNumberingDigitFlow, { journalName: "daily" });
      });

      it("does not offer to delete the only remaining digit", async () => {
        await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));

        expect(screen.queryByLabelText(m.journal_sequence_digit_delete())).toBeNull();
      });
    });

    describe("with two digits", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: {
            journals: {
              daily: fixedJournal("daily", { type: "day" }, { numbering: enabledNumbering(["release", "sprint"]) }),
            },
          },
        });
        harness.render(SequenceSection, { props: { journalName: "daily" } });
      });

      it("invokes the digit flow with the row index when editing", async () => {
        const invoke = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue({} as never);
        await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));

        await userEvent.click(screen.getAllByLabelText(m.journal_sequence_digit_edit())[1]);

        expect(invoke).toHaveBeenCalledWith(EditNumberingDigitFlow, { journalName: "daily", sourceIndex: 1 });
      });

      it("removes the digit at the clicked row", async () => {
        await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));

        await userEvent.click(screen.getAllByLabelText(m.journal_sequence_digit_delete())[1]);

        await waitFor(() => {
          expect(numberingOf(harness)?.sources.map((source) => source.variable)).toEqual(["release"]);
        });
      });

      it("promotes the next digit to index 0 when the top digit is deleted", async () => {
        await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));

        await userEvent.click(screen.getAllByLabelText(m.journal_sequence_digit_delete())[0]);

        await waitFor(() => {
          expect(numberingOf(harness)?.sources.map((source) => source.variable)).toEqual(["sprint"]);
        });
        // Promotion by position only — the promoted digit keeps its after-N reset rather than
        // being silently rewritten to never, which is still a legal index-0 kind.
        expect(numberingOf(harness)?.sources[0]?.reset).toEqual({ kind: "after", count: 6 });
      });
    });
  });

  describe("invertibility warning", () => {
    it("warns about a stale numbering variable left over from a rename", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              { nameTemplate: "{{index}}", numbering: enabledNumbering(["release", "sprint"]) },
            ),
          },
        },
      });
      harness.render(SequenceSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));

      expect(
        await screen.findByText(
          m.journal_edit_name_template_invertibility_warning({ reason: "unknown-variable", offending: "index" }),
        ),
      ).toBeTruthy();
    });

    it("warns when the first digit is cyclic", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                nameTemplate: "{{release}}-{{sprint}}",
                numbering: {
                  enabled: true,
                  anchorDate: anchor("2026-01-05"),
                  allowBefore: false,
                  sources: [
                    {
                      variable: "release",
                      frontmatterKey: "journal-release",
                      anchorValue: 1,
                      reset: { kind: "after", count: 4 },
                    },
                    {
                      variable: "sprint",
                      frontmatterKey: "journal-sprint",
                      anchorValue: 1,
                      reset: { kind: "after", count: 6 },
                    },
                  ],
                },
              },
            ),
          },
        },
      });
      harness.render(SequenceSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));

      expect(await screen.findByText(m.journal_edit_name_template_cyclic_top_warning())).toBeTruthy();
    });

    it("names the digits the template leaves out", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              { nameTemplate: "Sprint {{sprint}}", numbering: enabledNumbering(["release", "sprint"]) },
            ),
          },
        },
      });
      harness.render(SequenceSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));

      expect(
        await screen.findByText(
          m.journal_edit_name_template_unused_digits_warning({ missing: formatConjunction(["release"]) }),
        ),
      ).toBeTruthy();
    });

    it("shows no warning once the template covers every numbering variable", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              { nameTemplate: "{{release}}-{{sprint}}", numbering: enabledNumbering(["release", "sprint"]) },
            ),
          },
        },
      });
      harness.render(SequenceSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));

      expect(await screen.findByText("release")).toBeTruthy();
      expect(screen.queryByText(m.journal_edit_name_template_cyclic_top_warning())).toBeNull();
      expect(
        screen.queryByText(
          m.journal_edit_name_template_invertibility_warning({ reason: "unknown-variable", offending: "index" }),
        ),
      ).toBeNull();
    });
  });
});
