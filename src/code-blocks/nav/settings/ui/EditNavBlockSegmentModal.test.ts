import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { m } from "@/i18n";
import type { JournalConfig, NavBlockSegment } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { buildNavSegment, fixedJournal } from "@/journals/testing";
import type { ShelfConfig } from "@/shelves";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer } from "@/testing";

import EditNavBlockSegmentModal from "./EditNavBlockSegmentModal.vue";

async function mountModal(options: {
  segment?: NavBlockSegment;
  journals?: Record<string, JournalConfig>;
  shelves?: Record<string, ShelfConfig>;
}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule],
    data: {
      journals: options.journals ?? { daily: fixedJournal("daily", { type: "day" }) },
      ...(options.shelves && { shelves: options.shelves }),
    },
  });
  const rendered = harness.renderModal<typeof EditNavBlockSegmentModal, { segment: NavBlockSegment }>(
    EditNavBlockSegmentModal,
    { props: { journalName: "daily", segment: options.segment } },
  );
  return { harness, ...rendered };
}

describe("EditNavBlockSegmentModal", () => {
  it("opens blank when segment prop is undefined", async () => {
    await mountModal({});
    const input = screen.getByLabelText<HTMLInputElement>(m.nav_block_segment_field_template());
    expect(input.value).toBe("");
  });

  it("opens with pre-filled values when a segment is provided", async () => {
    await mountModal({
      segment: buildNavSegment({
        template: "{{date:YYYY}}",
        fontSize: 1.5,
        bold: true,
        link: "year",
        addDecorations: true,
      }),
    });
    const input = screen.getByLabelText<HTMLInputElement>(m.nav_block_segment_field_template());
    expect(input.value).toBe("{{date:YYYY}}");
  });

  it("does not submit when template is empty", async () => {
    const { submit } = await mountModal({});
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => {
      expect(screen.getByText(m.nav_block_segment_template_required())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits when template is present", async () => {
    const { submit } = await mountModal({});
    await userEvent.type(screen.getByLabelText(m.nav_block_segment_field_template()), "{{{{date:YYYY}}");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ segment: { template: "{{date:YYYY}}" } });
  });

  it("submits a bold segment when the bold text style is toggled on", async () => {
    const { submit } = await mountModal({});
    await userEvent.type(screen.getByLabelText(m.nav_block_segment_field_template()), "x");
    await userEvent.click(screen.getByRole("button", { name: m.nav_block_segment_field_bold() }));
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ segment: { bold: true, italic: false } });
  });

  it("marks the italic text style as pressed for a segment that is already italic", async () => {
    await mountModal({ segment: buildNavSegment({ template: "{{date:YYYY}}", italic: true }) });
    expect(screen.getByRole("button", { name: m.nav_block_segment_field_italic(), pressed: true })).toBeTruthy();
  });

  it("does not submit when link=journal but journal is empty", async () => {
    const { submit } = await mountModal({});
    await userEvent.type(screen.getByLabelText(m.nav_block_segment_field_template()), "x");
    await userEvent.selectOptions(screen.getByLabelText(m.nav_block_segment_field_link()), "journal");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => {
      expect(screen.getByText(m.nav_block_segment_journal_required())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("hides the journal dropdown when link is not 'journal'", async () => {
    await mountModal({});
    expect(screen.queryByLabelText(m.common_label_journal())).toBeNull();
  });

  it("shows shelf-mates excluding the current journal in the journal dropdown", async () => {
    await mountModal({
      journals: {
        daily: fixedJournal("daily", { type: "day" }),
        weekly: fixedJournal("weekly", { type: "week" }),
      },
      shelves: { home: buildShelf("home", { journals: ["daily", "weekly"] }) },
    });
    await userEvent.selectOptions(screen.getByLabelText(m.nav_block_segment_field_link()), "journal");
    const dropdown = await screen.findByLabelText<HTMLSelectElement>(m.common_label_journal());
    const optionValues = [...dropdown.options].map((option) => option.value);
    expect(optionValues).toContain("weekly");
    expect(optionValues).not.toContain("daily");
  });

  it("cancels via api.cancel when the cancel button is clicked", async () => {
    const { cancel } = await mountModal({});
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalled();
  });

  it("shows the link date field for a period link", async () => {
    await mountModal({ segment: buildNavSegment({ link: "quarter" }) });
    expect(screen.getByLabelText(m.nav_block_segment_field_link_date())).toBeTruthy();
  });

  it("hides the link date field when the link is none", async () => {
    await mountModal({ segment: buildNavSegment({ link: "none" }) });
    expect(screen.queryByLabelText(m.nav_block_segment_field_link_date())).toBeNull();
  });

  it("reports an unparsable link date", async () => {
    const { submit } = await mountModal({ segment: buildNavSegment({ link: "quarter", template: "x" }) });
    await userEvent.type(screen.getByLabelText(m.nav_block_segment_field_link_date()), "nonsense");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(screen.getByText(m.nav_block_segment_link_date_invalid())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("shows no shift preview when the link date is empty", async () => {
    await mountModal({ segment: buildNavSegment({ link: "quarter", linkDate: "" }) });
    expect(screen.queryByText(/Shifts to/)).toBeNull();
  });

  it("shows the shifted-date preview once a valid link date is entered", async () => {
    await mountModal({ segment: buildNavSegment({ link: "quarter", template: "x" }) });
    await userEvent.type(screen.getByLabelText(m.nav_block_segment_field_link_date()), "+1q");
    await waitFor(() => {
      expect(screen.queryByText(/Shifts to/)).toBeTruthy();
    });
  });

  it("accepts a valid link date", async () => {
    const { submit } = await mountModal({ segment: buildNavSegment({ link: "quarter", template: "x" }) });
    await userEvent.type(screen.getByLabelText(m.nav_block_segment_field_link_date()), "+1q");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ segment: { linkDate: "+1q" } });
  });
});

describe("EditNavBlockSegmentModal numbering variables", () => {
  it("passes the journal's numbering variable names to the variable reference modal", async () => {
    const { harness } = await mountModal({
      journals: {
        daily: fixedJournal(
          "daily",
          { type: "day" },
          {
            numbering: {
              enabled: true,
              anchorDate: "2024-01-01" as AnchorString,
              allowBefore: false,
              sources: [
                { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
              ],
            },
          },
        ),
      },
    });

    await userEvent.click(screen.getByText(m.journal_edit_variable_reference_link()));

    expect(
      harness.modals.lastOpen<{ numberingVariableNames: readonly string[] }>().props.numberingVariableNames,
    ).toEqual(["index"]);
  });
});
