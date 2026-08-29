import { $ } from "@wdio/globals";

import { UpdateLinksDialogButtonMissingError } from "./errors.js";

// Obsidian's own confirm dialog, opened by `fileManager.renameFile` whenever the vault's
// `alwaysUpdateLinks` config is off (the default) AND the renamed file has at least one link
// pointing at it.
// It is not a plugin dialog, so it is a SECOND `.modal-container` distinct from the one
// `e2e/support/settings.ts` scopes plugin dialogs to (that one excludes only the settings panel,
// so it would otherwise match this dialog too). `.modal-button-container` is the discriminator:
// Obsidian's own FileManager builds this dialog's button row into one, and no plugin dialog in
// this codebase emits that class — every plugin modal composes from `UiSettingRow` instead.
// Do NOT narrow this to `.mod-confirmation`. That class comes from the confirmation-modal
// subclass, which FileManager only started building this dialog from after the supported floor:
// at `manifest.minAppVersion` (1.8.7) it is a bare `Modal` that hand-rolls the same row
// (`modalEl.createDiv("modal-button-container")`), so a `.mod-confirmation` selector matches
// nothing there and the wait times out on every `earliest` combo while `latest` stays green.
const UPDATE_LINKS_DIALOG = ".modal-container:has(.modal-button-container)";

function updateLinksDialog(): ReturnType<typeof $> {
  return $(UPDATE_LINKS_DIALOG);
}

export function isUpdateLinksDialogOpen(): Promise<boolean> {
  return updateLinksDialog().isExisting();
}

export async function waitForUpdateLinksDialogOpen(): Promise<void> {
  await updateLinksDialog().waitForExist({
    timeoutMsg: 'expected Obsidian\'s native "Update links?" dialog to open',
  });
}

// Confirms the dialog by clicking its middle button. Obsidian's own FileManager builds the
// button row in a fixed order — "Always update", "Update", "Don't update" — and only the label
// changes with locale, so the middle button is targeted by position rather than by (untranslated,
// English) text. "Always update" is deliberately avoided: it also flips `alwaysUpdateLinks` to
// true for the whole vault, permanently skipping this dialog from then on, which is exactly the
// shortcut this suite is not supposed to take.
export async function confirmUpdateLinksDialog(): Promise<void> {
  await waitForUpdateLinksDialogOpen();
  const buttons = await updateLinksDialog().$$(".modal-button-container button").getElements();
  const updateButton = buttons[1];
  if (!updateButton) throw new UpdateLinksDialogButtonMissingError();
  await updateButton.click();
  await updateLinksDialog().waitForExist({
    reverse: true,
    timeoutMsg: '"Update links?" dialog did not close after confirming',
  });
}
