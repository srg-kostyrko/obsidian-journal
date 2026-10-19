import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { SettingsService } from "@/settings";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../../module";
import { notePropertySlice, type NotePropertySliceState } from "../slice";

import EditNotePropertyProviderModal from "./EditNotePropertyProviderModal.vue";

async function mount(seed: (state: NotePropertySliceState) => void = () => undefined) {
  const harness = await testContainer({ modules: [tasksCoreModule] });
  const slice = harness.resolve(SettingsService).getSlice(notePropertySlice);
  seed(slice.state);
  const { submit, cancel } = harness.renderModal(EditNotePropertyProviderModal);
  return { harness, slice, submit, cancel };
}

// UiPropertySuggest and FolderInput pass a testid to a wrapper or to the input itself.
function input(testId: string): HTMLInputElement {
  const element = screen.getByTestId(testId);
  const found = element.instanceOf(HTMLInputElement) ? element : element.querySelector("input");
  if (!found) throw new Error(`${testId} holds no input`);
  return found;
}

async function retype(testId: string, text: string): Promise<void> {
  await userEvent.clear(input(testId));
  if (text !== "") await userEvent.type(input(testId), text);
}

function saveButton(): HTMLButtonElement {
  const button = screen.getByText(m.common_action_submit()).closest("button");
  if (!button) throw new Error("no Save button");
  return button;
}

function statusRowIndex(value: string): number {
  const index = screen
    .getAllByLabelText(m.tasks_note_property_status_value_label())
    .findIndex((element) => (element as HTMLInputElement).value === value);
  if (index === -1) throw new Error(`no status row for ${value}`);
  return index;
}

describe("EditNotePropertyProviderModal", () => {
  it("leaves the slice untouched when edits are cancelled", async () => {
    const { slice, cancel } = await mount();
    const before = structuredClone(JSON.parse(JSON.stringify(slice.state)) as unknown);

    await retype("note-property-tag", "todo");
    await retype("note-property-status-property", "state");
    await userEvent.click(screen.getByTestId(`note-property-status-remove-${statusRowIndex("done")}`));
    await userEvent.click(screen.getByTestId("note-property-add-folder"));
    await userEvent.type(input("note-property-folder-0"), "Archive");
    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(JSON.parse(JSON.stringify(slice.state))).toEqual(before);
    expect(cancel).toHaveBeenCalled();
  });

  it("writes every field on Save", async () => {
    const { slice, submit } = await mount();

    await userEvent.click(screen.getByRole("radio", { name: m.tasks_note_property_identify_property() }));
    await retype("note-property-property-name", "type");
    await retype("note-property-property-value", "task");
    await userEvent.click(screen.getByTestId("note-property-add-folder"));
    await userEvent.type(input("note-property-folder-0"), "Templates");
    await retype("note-property-archive-tag", "old");
    await retype("note-property-date-due", "deadline");
    await retype("note-property-date-scheduled", "");
    await retype("note-property-date-start", "begins");
    await retype("note-property-status-property", "state");
    await retype(`note-property-status-value-${statusRowIndex("done")}`, "Complete");
    await userEvent.click(screen.getByTestId(`note-property-status-remove-${statusRowIndex("none")}`));
    await retype("note-property-title-property", "name");
    await retype("note-property-modified-property", "");
    await retype("note-property-recurrence", "repeat, series_parent");
    await userEvent.click(saveButton());

    expect(submit).toHaveBeenCalled();
    expect(JSON.parse(JSON.stringify(slice.state))).toEqual({
      enabled: false,
      identify: { by: "property", name: "type", value: "task" },
      excludedFolders: ["Templates"],
      archiveTag: "#old",
      dates: { due: "deadline", start: "begins", done: "completedDate", created: "dateCreated" },
      statusProperty: "state",
      statusMap: { open: "todo", "in-progress": "in-progress", complete: "done" },
      canonical: { todo: "open", done: "Complete", "in-progress": "in-progress" },
      titleProperty: "name",
      modifiedProperty: "",
      recurrenceProperties: ["repeat", "series_parent"],
    });
  });

  it("stores a tag typed without # in the form the reader matches", async () => {
    const { slice } = await mount();
    await retype("note-property-tag", "todo");
    await userEvent.click(saveButton());
    expect(slice.state.identify).toEqual({ by: "tag", tag: "#todo" });
  });

  it("lowercases a status value, since the reader matches values in any case", async () => {
    const { slice } = await mount();
    await userEvent.click(screen.getByTestId("note-property-add-status-value"));
    const added = screen.getAllByLabelText(m.tasks_note_property_status_value_label()).length - 1;
    await userEvent.type(input(`note-property-status-value-${added}`), "Waiting");
    await userEvent.click(saveButton());
    expect(slice.state.statusMap).toHaveProperty("waiting", "todo");
  });

  it("refuses an empty identification tag", async () => {
    const { slice, submit } = await mount();
    await retype("note-property-tag", "#");

    expect(screen.getByText(m.tasks_note_property_tag_required())).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    await userEvent.click(saveButton());
    expect(submit).not.toHaveBeenCalled();
    expect(slice.state.identify).toEqual({ by: "tag", tag: "#task" });
  });

  it("refuses an empty status value", async () => {
    const { submit } = await mount();
    await userEvent.click(screen.getByTestId("note-property-add-status-value"));

    expect(screen.getByText(m.tasks_note_property_status_value_required())).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    await userEvent.click(saveButton());
    expect(submit).not.toHaveBeenCalled();
  });

  it("refuses two status values that differ only in case", async () => {
    await mount();
    await userEvent.click(screen.getByTestId("note-property-add-status-value"));
    const added = screen.getAllByLabelText(m.tasks_note_property_status_value_label()).length - 1;
    await userEvent.type(input(`note-property-status-value-${added}`), "Done");

    expect(screen.getByText(m.tasks_note_property_status_value_duplicate({ value: "done" }))).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it("refuses a property identification with no property name", async () => {
    await mount();
    await userEvent.click(screen.getByRole("radio", { name: m.tasks_note_property_identify_property() }));

    expect(screen.getByText(m.tasks_note_property_property_required())).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  // The canonical mark follows its row, not its text: renaming the marked value must carry the
  // mark with it, or ticking a task done would write a value the map no longer reads as done.
  it("keeps the written-back mark on a renamed value", async () => {
    const { slice } = await mount();
    await retype(`note-property-status-value-${statusRowIndex("open")}`, "todo");
    await userEvent.click(saveButton());
    expect(slice.state.canonical.todo).toBe("todo");
  });

  it("moves the written-back mark to a surviving value when the marked one is removed", async () => {
    const { slice } = await mount();
    await userEvent.click(screen.getByTestId(`note-property-status-remove-${statusRowIndex("open")}`));
    await userEvent.click(saveButton());
    expect(slice.state.canonical.todo).toBe("none");
  });

  it("marks another value as written back for its status", async () => {
    const { slice } = await mount();
    await userEvent.click(screen.getByTestId(`note-property-written-back-${statusRowIndex("none")}`));
    await userEvent.click(saveButton());
    expect(slice.state.canonical.todo).toBe("none");
  });

  // The written-back value is what a tick puts into the note, so it keeps the vault's own case;
  // only the map keys, matched case-insensitively, are lowercased.
  it("keeps the case of a written-back value", async () => {
    const { slice } = await mount();
    await retype(`note-property-status-value-${statusRowIndex("done")}`, "Done");
    await userEvent.click(saveButton());
    expect(slice.state.canonical.done).toBe("Done");
    expect(slice.state.statusMap).toHaveProperty("done", "done");
    expect(slice.state.statusMap).not.toHaveProperty("Done");
  });

  it("round-trips a cased written-back value through open and Save", async () => {
    const { slice } = await mount((state) => {
      state.canonical = { ...state.canonical, done: "Done" };
    });
    expect(screen.getByTestId(`note-property-written-back-${statusRowIndex("Done")}`).dataset.current).toBe("true");
    await userEvent.click(saveButton());
    expect(slice.state.canonical.done).toBe("Done");
  });

  // An unknown value reads as to-do, so a to-do value with no row of its own still round-trips.
  it("keeps a stored written-back value that has no row, through open and Save", async () => {
    const { slice } = await mount((state) => {
      state.canonical = { ...state.canonical, todo: "backlog" };
    });
    const before = JSON.parse(JSON.stringify(slice.state)) as unknown;
    await userEvent.click(saveButton());
    expect(JSON.parse(JSON.stringify(slice.state))).toEqual(before);
  });

  it("keeps the to-do written-back value when the last to-do row is removed", async () => {
    const { slice } = await mount();
    await userEvent.click(screen.getByTestId(`note-property-status-remove-${statusRowIndex("open")}`));
    await userEvent.click(screen.getByTestId(`note-property-status-remove-${statusRowIndex("none")}`));
    await userEvent.click(saveButton());
    expect(slice.state.canonical.todo).toBe("none");
  });

  it("drops a written-back value whose last row is remapped to another status", async () => {
    const { slice } = await mount();
    const row = screen.getByTestId(`note-property-status-row-${statusRowIndex("in-progress")}`);
    const select = row.querySelector("select");
    if (!select) throw new Error("status row has no select");
    await userEvent.selectOptions(select, "done");
    await userEvent.click(saveButton());
    expect(slice.state.canonical).not.toHaveProperty("in-progress");
  });
});
