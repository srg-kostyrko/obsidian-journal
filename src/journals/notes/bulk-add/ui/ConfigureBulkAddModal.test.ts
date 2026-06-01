import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService, NotesService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import { FakeNotesService } from "@/infrastructure/host/testing";

import ConfigureBulkAddModal from "./ConfigureBulkAddModal.vue";

import type { BulkAddParameters } from "../config";

function buildContainer(): Container {
  const notes = new FakeNotesService();
  const inputSuggest = new FakeInputSuggestService();
  const container = new Container();
  container.register(NotesService).useValue(notes as unknown as NotesService);
  container.register(InputSuggestService).useValue(inputSuggest as unknown as InputSuggestService);
  return container;
}

function mountModal() {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<BulkAddParameters> = { submit, cancel };
  const container = buildContainer();

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
    expect(screen.queryByText(m.bulk_add_property_name_label())).toBeNull();
    const datePlace = screen.getByRole("combobox", { name: m.bulk_add_date_place_label() });
    await userEvent.selectOptions(datePlace, "property");
    expect(screen.getByText(m.bulk_add_property_name_label())).toBeTruthy();
  });
});
