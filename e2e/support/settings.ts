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

// UiButton renders its label as text content (Save / Back to list, ...). Icon adders like
// "Add block" / "Add toolbar item" and picker rows (whose "Add <name>" action is a
// UiIconButton) carry no text — reach them via clickIcon instead.
export async function clickButton(text: string): Promise<void> {
  await $(`button=${text}`).click();
}

// Journal-subpage sections are collapsed by default; one click on the trigger expands.
// The title text lives on the .collapsible-trigger element; partial match keeps it stable
// against the trailing flair count.
export async function expandSection(title: string): Promise<void> {
  await $(`.collapsible-trigger*=${title}`).click();
}

// Page-level UiSettingRow toggles carry no aria-label of their own; locate the row by its
// visible name and click the checkbox container inside its control cell.
export async function toggleSettingRow(name: string): Promise<void> {
  await $(
    `//div[contains(@class,"setting-item")][.//div[contains(@class,"setting-item-name")][normalize-space(.)="${name}"]]//div[contains(@class,"checkbox-container")]`,
  ).click();
}

// Every edit subpage opens with a breadcrumb back link (UiBackLink): an icon plus the
// "Back to list" label, so it's a text button rather than an icon button.
export async function goBack(): Promise<void> {
  await clickButton("Back to list");
}

export async function openShelfSubpage(shelf: string): Promise<void> {
  await clickIcon(`Configure ${shelf}`);
}

// Journals are all shelved in e2e-journeys, so a journal subpage is reached through its
// shelf: dashboard → Configure <shelf> → Configure <journal>.
export async function openJournalSubpage(shelf: string, journal: string): Promise<void> {
  await openShelfSubpage(shelf);
  await clickIcon(`Configure ${journal}`);
}

// Set the first text input in the open modal (the primary field — name/template/new-name).
export async function setModalText(value: string): Promise<void> {
  await activeModal().$('input[type="text"]').setValue(value);
}

// Choose an icon in the open modal's UiIconSuggest. Typing only filters — the value is committed
// by clicking a suggestion row, which Obsidian renders in a popup at the document root rather
// than inside the dialog, so the row is looked up globally. Pass the id as getIconIds() reports
// it: Obsidian prefixes the bundled Lucide set ("lucide-book-open"), unlike the bare names our
// own icon map authors.
export async function pickModalIcon(icon: string): Promise<void> {
  await activeModal().$(".ui-icon-suggest input").setValue(icon);
  await $(`.journal-suggestion-icon=${icon}`).click();
}

// Choose a date in the open dialog's DatePicker. The trigger opens the picker as a SECOND dialog
// stacked over this one, so the day cell is looked up globally (activeModal resolves the first
// dialog) via the production data-testid/data-anchor the calendar cells carry.
export async function pickModalDate(anchor: string): Promise<void> {
  await activeModal().$(".date-picker-trigger").click();
  const cell = $(`.modal-container [data-testid="month-cell"][data-anchor="${anchor}"]`);
  await cell.waitForClickable({ timeoutMsg: `date picker did not render the ${anchor} cell` });
  await cell.click();
}

// Pick an <option> by its value in the modal's first <select> (journal type, shelf, ...).
export async function selectModalSelect(value: string): Promise<void> {
  await activeModal().$("select").selectByAttribute("value", value);
}

// Pick an <option> by value in whichever modal <select> actually carries it. Use when the first
// <select> is not the target (e.g. the button editor renders a Journal dropdown before the mode
// dropdown), so selectModalSelect's first-<select> assumption would land on the wrong field.
export async function selectModalOption(value: string): Promise<void> {
  const selects = await activeModal().$$("select").getElements();
  for (const select of selects) {
    if (!(await select.$(`option[value="${value}"]`).isExisting())) continue;
    await select.selectByAttribute("value", value);
    return;
  }
  // No select carried the option; let wdio raise its descriptive "Option not found" on the first.
  await activeModal().$("select").selectByAttribute("value", value);
}

// A test that throws mid-modal leaves its dialog open; since activeModal() resolves the FIRST
// .modal-container, that stale dialog would shadow every later test's modal and cascade the
// failure. Escape closes Obsidian modals, so press it until no dialog remains.
export async function dismissDialogs(): Promise<void> {
  await browser.waitUntil(
    async () => {
      if (!(await activeModal().isExisting())) return true;
      await browser.keys("Escape");
      return false;
    },
    { timeout: 5000, interval: 250, timeoutMsg: "a leftover dialog would not dismiss" },
  );
}

// Set the first number input in the open modal (e.g. a calendar block's leading padding field).
export async function setModalNumber(value: number): Promise<void> {
  await activeModal().$('input[type="number"]').setValue(value);
}

// The CTA label varies by modal (Save for edits, Create for additions) — target the CTA class.
export async function submitModal(): Promise<void> {
  await activeModal().$("button.mod-cta").click();
  await activeModal().waitForExist({ reverse: true, timeoutMsg: "modal did not close after submit" });
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

// Read the dialog's rendered text, for assertions on copy the dialog derives rather than echoes
// (the delete dialog's connected-note count is computed from JournalsIndex).
export function modalText(): Promise<string> {
  return activeModal().getText();
}

export async function waitForDialogClosed(): Promise<void> {
  await activeModal().waitForExist({ reverse: true, timeoutMsg: "dialog did not close" });
}

export async function waitForModalOpen(): Promise<void> {
  await activeModal().waitForExist({ timeoutMsg: "expected a dialog to open" });
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

// Click a plain checkbox in the dialog by its wrapping <label>'s visible text. Clicking the label
// toggles its nested <input type="checkbox">.
export async function clickModalCheckboxByLabel(label: string): Promise<void> {
  await activeModal().$(`label*=${label}`).click();
}

// Click an option inside a UiToggleGroup in the open dialog by its exact visible text label
// (e.g. a weekday short name like "Sat"). UiToggleGroup renders <button> elements, not checkboxes.
export async function clickModalToggleOption(label: string): Promise<void> {
  await activeModal().$(`button=${label}`).click();
}
