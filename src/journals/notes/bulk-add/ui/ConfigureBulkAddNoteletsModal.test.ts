import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { NotesService } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { journalsCoreModule } from "../../../module";
import { fixedJournal } from "../../../testing";

import ConfigureBulkAddNoteletsModal from "./ConfigureBulkAddNoteletsModal.vue";

describe("ConfigureBulkAddNoteletsModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    harness.host.putFolder("Daily");
  });

  it("offers no existing-note control", () => {
    harness.renderModal(ConfigureBulkAddNoteletsModal, {
      props: { journalName: "daily", typeId: "nt_1", typeName: "Standup" },
    });

    expect(screen.queryByLabelText(m.bulk_add_existing_label())).toBeNull();
  });

  it("submits the type it was opened for", async () => {
    const { submit } = harness.renderModal(ConfigureBulkAddNoteletsModal, {
      props: { journalName: "daily", typeId: "nt_1", typeName: "Standup" },
    });
    harness.host.putFolder("inbox");
    await userEvent.type(screen.getByLabelText(m.bulk_add_folder_label()), "inbox");

    await userEvent.click(screen.getByText(m.bulk_add_next()));

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({ noteletTypeId: "nt_1", folder: "inbox" }));
    });
  });

  it("submits the default parameters when Continue is clicked", async () => {
    vi.spyOn(harness.resolve(NotesService), "folderExists").mockReturnValue(true);
    const { submit } = harness.renderModal(ConfigureBulkAddNoteletsModal, {
      props: { journalName: "daily", typeId: "nt_1", typeName: "Standup" },
    });

    await userEvent.click(screen.getByText(m.bulk_add_next()));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({ datePlace: "title", filterCombinator: "no", dryRun: true, noteletTypeId: "nt_1" }),
      ),
    );
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = harness.renderModal(ConfigureBulkAddNoteletsModal, {
      props: { journalName: "daily", typeId: "nt_1", typeName: "Standup" },
    });

    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(cancel).toHaveBeenCalled();
  });

  it("blocks submit when the source folder does not exist", async () => {
    const { submit } = harness.renderModal(ConfigureBulkAddNoteletsModal, {
      props: { journalName: "daily", typeId: "nt_1", typeName: "Standup" },
    });

    await userEvent.type(screen.getByRole("textbox", { name: m.bulk_add_folder_label() }), "Typo");
    await userEvent.click(screen.getByText(m.bulk_add_next()));

    await waitFor(() => expect(screen.getByText(m.bulk_add_folder_not_found())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("prefills the date format from the journal's configured format", async () => {
    const withNonDefaultFormat = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { dateFormat: "YYYY-MM" }) } },
    });

    withNonDefaultFormat.renderModal(ConfigureBulkAddNoteletsModal, {
      props: { journalName: "daily", typeId: "nt_1", typeName: "Standup" },
    });

    const input = screen.getByRole("textbox", { name: m.bulk_add_date_format_label() });
    expect((input as HTMLInputElement).value).toBe("YYYY-MM");
  });
});
