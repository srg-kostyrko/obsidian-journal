import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { AsyncResult } from "@/infrastructure/result";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { EditFrontmatterFieldFlow } from "../../flows/edit-frontmatter-field.flow";

import FrontmatterSection from "./FrontmatterSection.vue";

const FRONTMATTER = {
  dateField: "journal-date",
  startDateField: "journal-start-date",
  endDateField: "journal-end-date",
  noteletField: "journal-notelet",
  addStartDate: false,
  addEndDate: false,
} as const;

describe("FrontmatterSection", () => {
  describe("date field pencil", () => {
    it("invokes EditFrontmatterFieldFlow when the date-field pencil is clicked", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const flows = harness.resolve(Flows);
      vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok(undefined));
      harness.render(FrontmatterSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_frontmatter()));
      await userEvent.click(screen.getByLabelText(m.journal_fm_field_modal_title({ field: "dateField" })));

      expect(flows.invoke).toHaveBeenCalledWith(EditFrontmatterFieldFlow, {
        journalName: "daily",
        fieldName: "dateField",
      });
    });
  });

  describe("start date field", () => {
    it("hides the start-date field row when addStartDate is off", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { frontmatter: { ...FRONTMATTER } }) } },
      });
      harness.render(FrontmatterSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_frontmatter()));

      expect(screen.queryByText(m.journal_fm_field_label({ field: "startDateField" }))).toBeNull();
    });

    it("shows the start-date field row when addStartDate is on", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal("daily", { type: "day" }, { frontmatter: { ...FRONTMATTER, addStartDate: true } }),
          },
        },
      });
      harness.render(FrontmatterSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_frontmatter()));

      expect(screen.queryByText(m.journal_fm_field_label({ field: "startDateField" }))).not.toBeNull();
    });
  });

  describe("end date field", () => {
    it("hides the end-date field row when addEndDate is off", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { frontmatter: { ...FRONTMATTER } }) } },
      });
      harness.render(FrontmatterSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_frontmatter()));

      expect(screen.queryByText(m.journal_fm_field_label({ field: "endDateField" }))).toBeNull();
    });

    it("shows the end-date field row when addEndDate is on", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal("daily", { type: "day" }, { frontmatter: { ...FRONTMATTER, addEndDate: true } }),
          },
        },
      });
      harness.render(FrontmatterSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_edit_section_frontmatter()));

      expect(screen.queryByText(m.journal_fm_field_label({ field: "endDateField" }))).not.toBeNull();
    });
  });
});
