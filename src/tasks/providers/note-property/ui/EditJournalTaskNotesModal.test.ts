import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../../module";

import EditJournalTaskNotesModal from "./EditJournalTaskNotesModal.vue";

const checkbox = { compose: "narrow", mode: "or", conditions: [{ type: "tag", condition: "has", tags: ["#task"] }] };

async function mount(rule?: unknown) {
  const providers = rule === undefined ? { checkbox } : { checkbox, "note-property": rule };
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { journals: { Daily: fixedJournal("Daily", { type: "day" }, { tasks: { providers } } as never) } },
  });
  harness.renderModal(EditJournalTaskNotesModal, { props: { journalName: "Daily" } });
  const repository = harness.resolve(JournalsRepository);
  return { repository, providers: () => repository.get("Daily").getOrUndefined()?.tasks.providers };
}

function saveButton(): HTMLButtonElement {
  const button = screen.getByText(m.common_action_submit()).closest("button");
  if (!button) throw new Error("no Save button");
  return button;
}

function input(label: string, at = 0): HTMLInputElement {
  const element = screen.getAllByLabelText(label).at(at);
  const found = element instanceof HTMLInputElement ? element : element?.querySelector("input");
  if (!found) throw new Error(`no input labelled ${label}`);
  return found;
}

async function chooseMatching(): Promise<void> {
  await userEvent.click(screen.getByLabelText(m.tasks_note_visibility_show_matching()));
}

async function addCondition(type: "tag" | "folder" | "property"): Promise<void> {
  await userEvent.click(screen.getByTestId("note-visibility-add-condition"));
  const pickers = screen.getAllByTestId("note-visibility-condition-type");
  const picker = pickers.at(-1);
  if (!(picker instanceof HTMLSelectElement)) throw new TypeError("no type picker");
  await userEvent.selectOptions(picker, type);
}

describe("EditJournalTaskNotesModal", () => {
  it("selects All for a journal with no rule and hides the conditions", async () => {
    await mount();
    expect(screen.getByLabelText<HTMLInputElement>(m.tasks_note_visibility_show_all()).checked).toBe(true);
    expect(screen.queryByTestId("note-visibility-add-condition")).toBeNull();
  });

  it("seeds Matching and its conditions from the stored rule", async () => {
    await mount({ show: "matching", mode: "or", conditions: [{ type: "tag", tags: ["#work", "#home"] }] });
    expect(screen.getByLabelText<HTMLInputElement>(m.tasks_note_visibility_show_matching()).checked).toBe(true);
    expect(input(m.tasks_settings_condition_tag()).value).toBe("#work, #home");
  });

  it("leaves the journal untouched when edits are cancelled", async () => {
    const { providers } = await mount();
    const before = JSON.stringify(providers());

    await chooseMatching();
    await addCondition("tag");
    await userEvent.type(input(m.tasks_settings_condition_tag()), "work");
    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(JSON.stringify(providers())).toBe(before);
  });

  it("writes only the note-property rule on Save, leaving the checkbox rule byte-identical", async () => {
    const { providers } = await mount();
    const checkboxBefore = JSON.stringify(providers()?.checkbox);

    await chooseMatching();
    await addCondition("tag");
    await userEvent.type(input(m.tasks_settings_condition_tag()), "work, #home");
    await userEvent.click(saveButton());

    expect(JSON.stringify(providers()?.checkbox)).toBe(checkboxBefore);
    expect(providers()?.["note-property"]).toEqual({
      show: "matching",
      mode: "and",
      conditions: [{ type: "tag", tags: ["#work", "#home"] }],
    });
  });

  it("leaves the journal's listing filter unchanged on Save", async () => {
    const { repository } = await mount();
    const config = repository.get("Daily").getOrUndefined();
    if (config === undefined) throw new Error("no journal");
    repository.update("Daily", {
      tasks: { ...config.tasks, filter: { mode: "or", conditions: [{ type: "tag", condition: "has", tags: ["#x"] }] } },
    });
    const filterBefore = JSON.stringify(repository.get("Daily").getOrUndefined()?.tasks.filter);

    await userEvent.click(screen.getByLabelText(m.tasks_note_visibility_show_none()));
    await userEvent.click(saveButton());

    expect(JSON.stringify(repository.get("Daily").getOrUndefined()?.tasks.filter)).toBe(filterBefore);
  });

  it("keeps the conditions in storage when Matching switches to All", async () => {
    const { providers } = await mount({ show: "matching", mode: "or", conditions: [{ type: "tag", tags: ["#work"] }] });
    await userEvent.click(screen.getByLabelText(m.tasks_note_visibility_show_all()));
    await userEvent.click(saveButton());
    expect(providers()?.["note-property"]).toEqual({
      show: "all",
      mode: "or",
      conditions: [{ type: "tag", tags: ["#work"] }],
    });
  });

  it("labels the and/or choice", async () => {
    await mount();
    await chooseMatching();
    expect(screen.getByLabelText(m.tasks_note_visibility_mode())).toBe(screen.getByTestId("note-visibility-mode"));
  });

  it("writes None", async () => {
    const { providers } = await mount();
    await userEvent.click(screen.getByLabelText(m.tasks_note_visibility_show_none()));
    await userEvent.click(saveButton());
    expect(providers()?.["note-property"]).toEqual({ show: "none", mode: "and", conditions: [] });
  });

  it("writes a folder condition relative to the vault root", async () => {
    const { providers } = await mount();
    await chooseMatching();
    await addCondition("folder");
    await userEvent.type(input(m.tasks_note_property_folder_label()), "/Projects");
    await userEvent.click(saveButton());
    expect(providers()?.["note-property"]?.conditions).toEqual([{ type: "folder", folders: ["Projects"] }]);
  });

  it("writes a property condition with its values, under Match any", async () => {
    const { providers } = await mount();
    await chooseMatching();
    await userEvent.selectOptions(screen.getByTestId("note-visibility-mode"), "or");
    await addCondition("property");
    await userEvent.type(input(m.common_label_property_name()), "projects");
    await userEvent.type(input(m.tasks_note_property_value()), "[[[[Website]]");
    await userEvent.click(screen.getByText(m.tasks_note_property_add_value()));
    await userEvent.type(input(m.tasks_note_property_value(), 1), "Shop");
    await userEvent.click(saveButton());
    expect(providers()?.["note-property"]).toEqual({
      show: "matching",
      mode: "or",
      conditions: [{ type: "property", name: "projects", values: ["[[Website]]", "Shop"] }],
    });
  });

  it("disables Save for a property condition with no name or value", async () => {
    const { providers } = await mount();
    await chooseMatching();
    await addCondition("property");

    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText(m.tasks_note_property_property_required())).toBeTruthy();
    expect(screen.getByText(m.tasks_condition_values_required())).toBeTruthy();
    await userEvent.click(saveButton());
    expect(providers()?.["note-property"]).toBeUndefined();
  });

  it("disables Save for a tag condition holding only blank entries", async () => {
    await mount();
    await chooseMatching();
    await addCondition("tag");
    await userEvent.type(input(m.tasks_settings_condition_tag()), "#, ");
    expect(saveButton().disabled).toBe(true);
  });

  it("removes a condition", async () => {
    const { providers } = await mount({
      show: "matching",
      mode: "and",
      conditions: [
        { type: "tag", tags: ["#work"] },
        { type: "folder", folders: ["Projects"] },
      ],
    });
    const [first] = screen.getAllByTestId("note-visibility-remove-condition");
    if (first === undefined) throw new Error("no remove button");
    await userEvent.click(first);
    await userEvent.click(saveButton());
    expect(providers()?.["note-property"]?.conditions).toEqual([{ type: "folder", folders: ["Projects"] }]);
  });

  it("keeps the saved rule on the journal across a rename", async () => {
    const { repository } = await mount();
    await userEvent.click(screen.getByLabelText(m.tasks_note_visibility_show_none()));
    await userEvent.click(saveButton());

    repository.rename("Daily", "Diary");

    expect(repository.get("Diary").getOrUndefined()?.tasks.providers["note-property"]).toEqual({
      show: "none",
      mode: "and",
      conditions: [],
    });
  });
});
