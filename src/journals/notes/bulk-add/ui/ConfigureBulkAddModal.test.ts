import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { NotesService } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { journalsCoreModule } from "../../../module";
import { fixedJournal } from "../../../testing";

import ConfigureBulkAddModal from "./ConfigureBulkAddModal.vue";

describe("ConfigureBulkAddModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    harness.host.putFolder("Daily");
  });

  it("submits the default parameters when Continue is clicked", async () => {
    // The fake host's root folder lives at "" while NotesService falls back to "/" for an
    // empty folder, so the default (vault root) folder can never resolve through the fake vault.
    vi.spyOn(harness.resolve(NotesService), "folderExists").mockReturnValue(true);
    const { submit } = harness.renderModal(ConfigureBulkAddModal, { props: { journalName: "daily" } });

    await userEvent.click(screen.getByText(m.bulk_add_next()));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({ datePlace: "title", filterCombinator: "no", dryRun: true }),
      ),
    );
  });

  it("reveals the property-name field only when reading the date from a property", async () => {
    harness.renderModal(ConfigureBulkAddModal, { props: { journalName: "daily" } });

    expect(screen.queryByText(m.common_label_property_name())).toBeNull();
    const datePlace = screen.getByRole("combobox", { name: m.bulk_add_date_place_label() });
    await userEvent.selectOptions(datePlace, "property");
    expect(screen.getByText(m.common_label_property_name())).toBeTruthy();
  });

  it("notes the stored-format caveat only when reading the date from a property", async () => {
    harness.renderModal(ConfigureBulkAddModal, { props: { journalName: "daily" } });

    expect(screen.queryByText(m.bulk_add_date_format_property_note())).toBeNull();
    const datePlace = screen.getByRole("combobox", { name: m.bulk_add_date_place_label() });
    await userEvent.selectOptions(datePlace, "property");
    expect(screen.getByText(m.bulk_add_date_format_property_note())).toBeTruthy();
  });

  it("blocks submit and shows an error when property mode has a blank property name", async () => {
    const { submit } = harness.renderModal(ConfigureBulkAddModal, { props: { journalName: "daily" } });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: m.bulk_add_date_place_label() }), "property");
    await userEvent.click(screen.getByText(m.bulk_add_next()));

    await waitFor(() => expect(screen.getByText(m.journal_property_name_required())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("explains why submit is blocked when the date format is cleared", async () => {
    const { submit } = harness.renderModal(ConfigureBulkAddModal, { props: { journalName: "daily" } });

    await userEvent.clear(screen.getByRole("textbox", { name: m.bulk_add_date_format_label() }));
    await userEvent.click(screen.getByText(m.bulk_add_next()));

    await waitFor(() => expect(screen.getByText(m.bulk_add_date_format_required())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = harness.renderModal(ConfigureBulkAddModal, { props: { journalName: "daily" } });

    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(cancel).toHaveBeenCalled();
  });

  it("blocks submit when the source folder does not exist", async () => {
    const { submit } = harness.renderModal(ConfigureBulkAddModal, { props: { journalName: "daily" } });

    await userEvent.type(screen.getByRole("textbox", { name: m.bulk_add_folder_label() }), "Typo");
    await userEvent.click(screen.getByText(m.bulk_add_next()));

    await waitFor(() => expect(screen.getByText(m.bulk_add_folder_not_found())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits a source folder that exists", async () => {
    const { submit } = harness.renderModal(ConfigureBulkAddModal, { props: { journalName: "daily" } });

    await userEvent.type(screen.getByRole("textbox", { name: m.bulk_add_folder_label() }), "Daily");
    await userEvent.click(screen.getByText(m.bulk_add_next()));

    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ folder: "Daily" })));
  });
});

describe("ConfigureBulkAddModal with a non-default journal date format", () => {
  it("prefills the date format from the journal's configured format", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { dateFormat: "YYYY-MM" }) } },
    });

    harness.renderModal(ConfigureBulkAddModal, { props: { journalName: "daily" } });

    const input = screen.getByRole("textbox", { name: m.bulk_add_date_format_label() });
    expect((input as HTMLInputElement).value).toBe("YYYY-MM");
  });
});
