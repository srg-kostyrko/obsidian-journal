import { $, browser } from "@wdio/globals";

const PLUGIN_ID = "journals";

// The settings panel is itself an Obsidian modal (a .modal-container wrapping .mod-settings),
// so a plugin dialog opened on top is a SECOND .modal-container. Scope every modal interaction
// to the dialog container — the one NOT wrapping the settings panel — or `$(".modal-container")`
// would resolve to the settings panel behind it, whose Save/Delete buttons don't exist and
// whose container never closes.
const DIALOG = ".modal-container:not(:has(.mod-settings))";

function activeModal(): ReturnType<typeof $> {
  return $(DIALOG);
}

// The dashboard wrapper renders only when the SPA stack is empty (current === null);
// entering a subpage replaces it with the subpage component, so its presence is the
// "am I on the dashboard?" signal.
const DASHBOARD = ".journal-settings-dashboard";

// Open the plugin's settings tab. Obsidian calls PluginSettingTab.display(), which mounts
// the SettingsDashboard Vue app. open()/openTabById are runtime-only (cast like commands.ts).
export async function openSettings(): Promise<void> {
  await browser.executeObsidian(({ app }, id) => {
    const setting = (app as unknown as { setting: { open(): void; openTabById(id: string): void } }).setting;
    setting.open();
    setting.openTabById(id);
  }, PLUGIN_ID);
  await $(DASHBOARD).waitForExist({ timeoutMsg: "settings dashboard did not mount" });
}

// Close settings. PluginSettingTab.hide() runs SettingsUiService.reset(), so the next
// openSettings() starts at the dashboard root with an empty subpage stack.
export async function closeSettings(): Promise<void> {
  await browser.executeObsidian(({ app }) => {
    (app as unknown as { setting: { close(): void } }).setting.close();
  });
}

// UiIconButton has no text — its tooltip is the aria-label. Row buttons embed the entity
// name, so the label is unique page-wide.
export async function clickIcon(label: string): Promise<void> {
  await $(`button[aria-label="${label}"]`).click();
}

// UiButton renders its label as text content (Save / a picker option, ...). Icon adders
// like "Add block" / "Add toolbar item" carry no text — reach them via clickIcon instead.
export async function clickButton(text: string): Promise<void> {
  await $(`button=${text}`).click();
}

// Journal-subpage sections are collapsed by default; one click on the trigger expands.
// The title text lives on the .collapsible-trigger element; partial match keeps it stable
// against the trailing flair count.
export async function expandSection(title: string): Promise<void> {
  await $(`.collapsible-trigger*=${title}`).click();
}

export async function goBack(): Promise<void> {
  await clickIcon("Back to list");
}

export async function openShelfSubpage(shelf: string): Promise<void> {
  await clickIcon(`Organize ${shelf}`);
}

// Journals are all shelved in e2e-journeys, so a journal subpage is reached through its
// shelf: dashboard → Organize <shelf> → Edit <journal>.
export async function openJournalSubpage(shelf: string, journal: string): Promise<void> {
  await openShelfSubpage(shelf);
  await clickIcon(`Edit ${journal}`);
}

// Set the first text input in the open modal (the primary field — name/template/new-name).
export async function setModalText(value: string): Promise<void> {
  await activeModal().$('input[type="text"]').setValue(value);
}

// Pick an <option> by its value in the modal's first <select> (journal type, shelf, ...).
export async function selectModalSelect(value: string): Promise<void> {
  await activeModal().$("select").selectByAttribute("value", value);
}

export async function submitModal(): Promise<void> {
  await activeModal().$("button=Save").click();
  await activeModal().waitForExist({ reverse: true, timeoutMsg: "modal did not close after Save" });
}

export async function deleteInModal(): Promise<void> {
  await activeModal().$("button=Delete").click();
  await activeModal().waitForExist({ reverse: true, timeoutMsg: "modal did not close after Delete" });
}

// Click a button by text inside the active (non-settings) dialog. It waits for the button to be
// clickable first, so callers needn't pre-wait when a multi-step dialog (bulk-add) only renders
// the next button after its async step (plan()) completes. Unlike submitModal it does not wait
// for the dialog to close — multi-step dialogs swap content in place, and closing callers wait
// explicitly via waitForDialogClosed.
export async function clickDialogButton(label: string): Promise<void> {
  const button = activeModal().$(`button=${label}`);
  await button.waitForClickable({ timeoutMsg: `dialog button "${label}" did not become clickable` });
  await button.click();
}

export async function waitForDialogClosed(): Promise<void> {
  await activeModal().waitForExist({ reverse: true, timeoutMsg: "dialog did not close" });
}

// Click the dialog's sole checkbox toggle (UiToggle renders a .checkbox-container). Used by
// bulk-add to turn off the default dry-run; valid only when the dialog has exactly one toggle.
export async function toggleModalCheckbox(): Promise<void> {
  await activeModal().$(".checkbox-container").click();
}

// Select an <option> by value inside a specific UiDropdown in the open dialog, identified by its
// aria-label. Unlike selectModalSelect (first <select>), this disambiguates a modal with several
// dropdowns (the bulk-add configure modal's date-place / combinator / existing-note selects).
export async function selectModalDropdownByLabel(ariaLabel: string, value: string): Promise<void> {
  await activeModal().$(`select[aria-label="${ariaLabel}"]`).selectByAttribute("value", value);
}

// Toggle a specific UiToggle in the open dialog by its tooltip, which UiToggle renders as the
// .checkbox-container's aria-label. Needed when a modal has several toggles (connect-note's
// rename + move) that the single-checkbox toggleModalCheckbox cannot disambiguate.
export async function toggleNamedModalToggle(ariaLabel: string): Promise<void> {
  await activeModal().$(`.checkbox-container[aria-label="${ariaLabel}"]`).click();
}

// Click a plain checkbox in the dialog by its wrapping <label>'s visible text (e.g. a weekday
// short name like "Sat"). Clicking the label toggles its nested <input type="checkbox">.
export async function clickModalCheckboxByLabel(label: string): Promise<void> {
  await activeModal().$(`label*=${label}`).click();
}
