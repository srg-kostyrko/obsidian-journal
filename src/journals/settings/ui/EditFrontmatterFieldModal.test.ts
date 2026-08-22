import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import EditFrontmatterFieldModal from "./EditFrontmatterFieldModal.vue";
import { editFrontmatterFieldModal } from "./modals";

describe("editFrontmatterFieldModal definition", () => {
  it("titles the modal using the field name variant", () => {
    expect(editFrontmatterFieldModal.title({ journalName: "daily", fieldName: "dateField" })).toBe(
      m.journal_fm_field_modal_title({ field: "dateField" }),
    );
  });
});

describe("EditFrontmatterFieldModal", () => {
  it("renders the current dateField value", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            {
              frontmatter: {
                dateField: "occurred-on",
                startDateField: "journal-start-date",
                endDateField: "journal-end-date",
                addStartDate: false,
                addEndDate: false,
              },
            },
          ),
        },
      },
    });
    harness.renderModal(EditFrontmatterFieldModal, { props: { journalName: "daily", fieldName: "dateField" } });
    expect(screen.getByText("occurred-on")).toBeTruthy();
  });

  it("renders the current startDateField value", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            {
              frontmatter: {
                dateField: "journal-date",
                startDateField: "begins-on",
                endDateField: "journal-end-date",
                addStartDate: false,
                addEndDate: false,
              },
            },
          ),
        },
      },
    });
    harness.renderModal(EditFrontmatterFieldModal, { props: { journalName: "daily", fieldName: "startDateField" } });
    expect(screen.getByText("begins-on")).toBeTruthy();
  });

  it("renders the current endDateField value", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            {
              frontmatter: {
                dateField: "journal-date",
                startDateField: "journal-start-date",
                endDateField: "ends-on",
                addStartDate: false,
                addEndDate: false,
              },
            },
          ),
        },
      },
    });
    harness.renderModal(EditFrontmatterFieldModal, { props: { journalName: "daily", fieldName: "endDateField" } });
    expect(screen.getByText("ends-on")).toBeTruthy();
  });

  describe("with the default dateField journal", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("submits the new value on Save", async () => {
      const { submit } = harness.renderModal(EditFrontmatterFieldModal, {
        props: { journalName: "daily", fieldName: "dateField" },
      });
      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.type(input, "happened-on");
      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({ newValue: "happened-on" });
      });
    });

    it("rejects an empty new value with required error", async () => {
      const { submit } = harness.renderModal(EditFrontmatterFieldModal, {
        props: { journalName: "daily", fieldName: "dateField" },
      });
      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(screen.getByText(m.journal_property_name_required())).toBeTruthy();
      });
      expect(submit).not.toHaveBeenCalled();
    });

    it("cancels when the user clicks Cancel", async () => {
      const { cancel } = harness.renderModal(EditFrontmatterFieldModal, {
        props: { journalName: "daily", fieldName: "dateField" },
      });
      await userEvent.click(screen.getByText(m.common_action_cancel()));
      expect(cancel).toHaveBeenCalledTimes(1);
    });
  });
});
