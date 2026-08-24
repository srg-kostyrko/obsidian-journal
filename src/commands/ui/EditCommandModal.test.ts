import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import type { JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { buildCommand } from "../testing";

import EditCommandModal from "./EditCommandModal.vue";
import { editCommandModal } from "./modals";

import type { CommandConfig, CommandTarget } from "../config";

async function mountModal(options: {
  command?: CommandConfig;
  target: CommandTarget;
  takenNames?: string[];
  journals?: Record<string, JournalConfig>;
}) {
  const harness = await testContainer({
    modules: [journalsCoreModule],
    data: { journals: options.journals ?? {} },
  });
  return harness.renderModal<typeof EditCommandModal, CommandConfig>(EditCommandModal, {
    props: { command: options.command, target: options.target, takenNames: options.takenNames ?? [] },
  });
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
    const command = buildCommand({ name: "Existing" });
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
      journals: { daily: fixedJournal("daily", { type: "day" }) },
    });
    expect(screen.getByText(m.command_name_prefix_hint({ kind: "journal" }))).toBeTruthy();
  });

  it("omits the note type field for a journal-targeted command", async () => {
    await mountModal({
      target: { kind: "journal", journalName: "daily" },
      journals: { daily: fixedJournal("daily", { type: "day" }) },
    });
    expect(screen.queryByText(m.command_modal_write_type_label())).toBeNull();
  });

  it("shows the note type field for a shelf-targeted command", async () => {
    await mountModal({ target: { kind: "shelf", shelfName: "work", writeType: "day" } });
    expect(screen.getByText(m.command_modal_write_type_label())).toBeTruthy();
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
      journals: { weekly: fixedJournal("weekly", { type: "week" }) },
    });
    const typeSelect = screen.getAllByRole("combobox")[0]; // the type dropdown is the first combobox
    const optionValues = [...typeSelect.querySelectorAll("option")].map((o) => o.getAttribute("value"));
    expect(optionValues).toEqual(["same", "next", "previous", "previous_available", "next_available"]);
  });

  it("pre-populates the name from an existing command in edit mode", async () => {
    await mountModal({ command: buildCommand({ name: "Existing" }), target: { kind: "all", writeType: "day" } });
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
