import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { JournalsRepository } from "@/journals/repository";
import { JournalsEventsToken } from "@/journals/tokens";
import { JournalsViewModel } from "@/journals/view-model";
import { createSettingsService } from "@/settings/testing";

import { commandCollection, type CommandConfig, type CommandTarget } from "../config";

import EditCommandModal from "./EditCommandModal.vue";
import { editCommandModal } from "./modals";

afterEach(() => cleanup());

function makeJournal(name: string, writeType: "day" | "week") {
  return {
    name,
    write: { type: writeType },
    timeline: { start: "", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
  };
}

async function mountModal(options: {
  command?: CommandConfig;
  target: CommandTarget;
  takenNames?: string[];
  journals?: Record<string, unknown>;
}) {
  const { service: settings, container } = createSettingsService({
    collections: [commandCollection, journalConfigCollection],
    raw: { version: 4, journals: options.journals ?? {} },
  });
  await settings.initialize();
  container.register(JournalsEventsToken).useFactory(() => createNanoEvents());
  container.register(JournalsRepository).useClass(JournalsRepository);
  container.register(JournalsViewModel).useClass(JournalsViewModel);
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<CommandConfig> = { submit, cancel };
  render(EditCommandModal, {
    props: { command: options.command, target: options.target, takenNames: options.takenNames ?? [] },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
            provideModalApiOnApp(app, api as ModalApi<unknown>);
          },
        },
      ],
    },
  });
  return { submit, cancel };
}

describe("editCommandModal definition", () => {
  it("uses the add title when no command is supplied", () => {
    expect(editCommandModal.title({ target: { kind: "all", writeType: "day" }, takenNames: [] })).toBe(m.command_add());
  });

  it("labels the confirm button Create when no command is supplied", async () => {
    await mountModal({ target: { kind: "all", writeType: "day" } });
    expect(screen.getByText(m.common_action_create())).toBeTruthy();
    expect(screen.queryByText(m.common_action_submit())).toBeNull();
  });

  it("uses the edit title when a command is supplied", () => {
    const command: CommandConfig = {
      name: "Existing",
      icon: "",
      showInRibbon: false,
      openMode: "active",
      target: { kind: "all", writeType: "day" },
      type: "same",
      context: "today",
    };
    expect(editCommandModal.title({ command, target: { kind: "all", writeType: "day" }, takenNames: [] })).toBe(
      m.command_edit(),
    );
  });
});

describe("EditCommandModal", () => {
  it("submits an all-target command with the entered values", async () => {
    const { submit } = await mountModal({ target: { kind: "all", writeType: "day" } });
    await userEvent.type(screen.getByRole("textbox"), "Open today");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        name: "Open today",
        icon: "",
        showInRibbon: false,
        openMode: "active",
        target: { kind: "all", writeType: "day" },
        type: "same",
        context: "today",
      }),
    );
  });

  it("shows the auto-prefix hint for a journal-targeted command", async () => {
    await mountModal({
      target: { kind: "journal", journalName: "daily" },
      journals: { daily: makeJournal("daily", "day") },
    });
    expect(screen.getByText(m.command_name_prefix_hint({ kind: "journal" }))).toBeTruthy();
  });

  it("shows the auto-prefix hint for a shelf-targeted command", async () => {
    await mountModal({ target: { kind: "shelf", shelfName: "work", writeType: "day" } });
    expect(screen.getByText(m.command_name_prefix_hint({ kind: "shelf" }))).toBeTruthy();
  });

  it("omits the auto-prefix hint for a plugin-level command", async () => {
    await mountModal({ target: { kind: "all", writeType: "day" } });
    expect(screen.queryByText(m.command_name_prefix_hint({ kind: "journal" }))).toBeNull();
    expect(screen.queryByText(m.command_name_prefix_hint({ kind: "shelf" }))).toBeNull();
  });

  it("surfaces a required-name error when submitting without a name", async () => {
    const { submit } = await mountModal({ target: { kind: "all", writeType: "day" } });
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(screen.getByText(m.command_name_required_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("surfaces a unique-name error when the name collides", async () => {
    const { submit } = await mountModal({
      target: { kind: "all", writeType: "day" },
      takenNames: ["Taken"],
    });
    await userEvent.type(screen.getByRole("textbox"), "Taken");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(screen.getByText(m.command_name_unique_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("requires an icon when show-in-ribbon is enabled", async () => {
    const { submit } = await mountModal({ target: { kind: "all", writeType: "day" } });
    await userEvent.type(screen.getByRole("textbox"), "Ribboned");
    await userEvent.click(screen.getByLabelText(m.common_show_in_ribbon()));
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(screen.getByText(m.command_icon_required_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("offers only the supported types for a weekly journal target", async () => {
    await mountModal({
      target: { kind: "journal", journalName: "weekly" },
      journals: { weekly: makeJournal("weekly", "week") },
    });
    const typeSelect = screen.getAllByRole("combobox")[0]; // the type dropdown is the first combobox
    const optionValues = [...typeSelect.querySelectorAll("option")].map((o) => o.getAttribute("value"));
    expect(optionValues).toEqual(["same", "next", "previous", "previous_available", "next_available"]);
  });

  it("pre-populates the name from an existing command in edit mode", async () => {
    const command: CommandConfig = {
      name: "Existing",
      icon: "",
      showInRibbon: false,
      openMode: "active",
      target: { kind: "all", writeType: "day" },
      type: "same",
      context: "today",
    };
    await mountModal({ command, target: { kind: "all", writeType: "day" } });
    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("Existing");
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = await mountModal({ target: { kind: "all", writeType: "day" } });
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("submits a shelf-target command with the entered values", async () => {
    const { submit } = await mountModal({ target: { kind: "shelf", shelfName: "work", writeType: "day" } });
    await userEvent.type(screen.getByRole("textbox"), "Open work");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        name: "Open work",
        icon: "",
        showInRibbon: false,
        openMode: "active",
        target: { kind: "shelf", shelfName: "work", writeType: "day" },
        type: "same",
        context: "today",
      }),
    );
  });

  it("submits the write type chosen for a shelf target", async () => {
    const { submit } = await mountModal({ target: { kind: "shelf", shelfName: "work", writeType: "day" } });
    await userEvent.type(screen.getByRole("textbox"), "Open work weekly");
    await userEvent.selectOptions(screen.getAllByRole("combobox")[0], "week");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({ target: { kind: "shelf", shelfName: "work", writeType: "week" } }),
      ),
    );
  });
});
