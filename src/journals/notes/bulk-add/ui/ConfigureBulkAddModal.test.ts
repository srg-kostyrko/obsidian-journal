import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService, NotesService, type VaultPath } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import { FakeNotesService } from "@/infrastructure/host/testing";
import { JournalsRepository } from "@/journals/repository";
import { fakeRepo, fixedJournal } from "@/journals/testing";
import { JournalsViewModel } from "@/journals/view-model";

import ConfigureBulkAddModal from "./ConfigureBulkAddModal.vue";

import type { BulkAddParameters } from "../config";

function buildContainer(dateFormat = "YYYY-MM-DD"): Container {
  const notes = new FakeNotesService();
  notes.seed("Daily/2026-07-17.md" as VaultPath);
  const inputSuggest = new FakeInputSuggestService();
  const container = new Container();
  container.register(NotesService).useValue(notes as unknown as NotesService);
  container.register(InputSuggestService).useValue(inputSuggest as unknown as InputSuggestService);
  container
    .register(JournalsRepository)
    .useValue(fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { dateFormat }) }));
  container.register(JournalsViewModel).useClass(JournalsViewModel);
  return container;
}

function mountModal(dateFormat?: string) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<BulkAddParameters> = { submit, cancel };
  const container = buildContainer(dateFormat);

  render(ConfigureBulkAddModal, {
    props: { journalName: "daily" },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
            provideModalApiOnApp(app, api as unknown as ModalApi<unknown>);
          },
        },
      ],
    },
  });

  return { submit, cancel };
}

afterEach(() => cleanup());

describe("ConfigureBulkAddModal", () => {
  it("submits the default parameters when Continue is clicked", async () => {
    const { submit } = mountModal();
    await userEvent.click(screen.getByText(m.bulk_add_next()));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({ datePlace: "title", filterCombinator: "no", dryRun: true }),
      ),
    );
  });

  it("reveals the property-name field only when reading the date from a property", async () => {
    mountModal();
    expect(screen.queryByText(m.common_label_property_name())).toBeNull();
    const datePlace = screen.getByRole("combobox", { name: m.bulk_add_date_place_label() });
    await userEvent.selectOptions(datePlace, "property");
    expect(screen.getByText(m.common_label_property_name())).toBeTruthy();
  });

  it("notes the stored-format caveat only when reading the date from a property", async () => {
    mountModal();
    expect(screen.queryByText(m.bulk_add_date_format_property_note())).toBeNull();
    const datePlace = screen.getByRole("combobox", { name: m.bulk_add_date_place_label() });
    await userEvent.selectOptions(datePlace, "property");
    expect(screen.getByText(m.bulk_add_date_format_property_note())).toBeTruthy();
  });

  it("prefills the date format from the journal's configured format", () => {
    mountModal("YYYY-MM");
    const input = screen.getByRole("textbox", { name: m.bulk_add_date_format_label() });
    expect((input as HTMLInputElement).value).toBe("YYYY-MM");
  });

  it("blocks submit and shows an error when property mode has a blank property name", async () => {
    const { submit } = mountModal();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: m.bulk_add_date_place_label() }), "property");
    await userEvent.click(screen.getByText(m.bulk_add_next()));
    await waitFor(() => expect(screen.getByText(m.journal_property_name_required())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("explains why submit is blocked when the date format is cleared", async () => {
    const { submit } = mountModal();
    await userEvent.clear(screen.getByRole("textbox", { name: m.bulk_add_date_format_label() }));
    await userEvent.click(screen.getByText(m.bulk_add_next()));
    await waitFor(() => expect(screen.getByText(m.bulk_add_date_format_required())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = mountModal();
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalled();
  });

  it("blocks submit when the source folder does not exist", async () => {
    const { submit } = mountModal();
    await userEvent.type(screen.getByRole("textbox", { name: m.bulk_add_folder_label() }), "Typo");
    await userEvent.click(screen.getByText(m.bulk_add_next()));
    await waitFor(() => expect(screen.getByText(m.bulk_add_folder_not_found())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("submits a source folder that exists", async () => {
    const { submit } = mountModal();
    await userEvent.type(screen.getByRole("textbox", { name: m.bulk_add_folder_label() }), "Daily");
    await userEvent.click(screen.getByText(m.bulk_add_next()));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ folder: "Daily" })));
  });
});
