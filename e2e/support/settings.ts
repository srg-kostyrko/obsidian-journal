import { $, browser } from "@wdio/globals";

const PLUGIN_ID = "journals";
const MODAL = ".modal-container";

// The dashboard wrapper renders only when the SPA stack is empty (current === null);
// entering a subpage replaces it with the subpage component, so its presence is the
// "am I on the dashboard?" signal.
export const DASHBOARD = ".journal-settings-dashboard";

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

// UiButton renders its label as text content (Save / Add block / a picker option, ...).
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
  await $(`${MODAL} input[type="text"]`).setValue(value);
}

// Pick an <option> by its value in the modal's first <select> (journal type, shelf, ...).
export async function selectModalSelect(value: string): Promise<void> {
  await $(`${MODAL} select`).selectByAttribute("value", value);
}

export async function submitModal(): Promise<void> {
  await $(MODAL).$("button=Save").click();
  await $(MODAL).waitForExist({ reverse: true, timeoutMsg: "modal did not close after Save" });
}

export async function deleteInModal(): Promise<void> {
  await $(MODAL).$("button=Delete").click();
  await $(MODAL).waitForExist({ reverse: true, timeoutMsg: "modal did not close after Delete" });
}
