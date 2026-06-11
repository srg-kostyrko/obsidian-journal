import { $, browser } from "@wdio/globals";

// `commands` is part of Obsidian's runtime but not its public typings (same shape
// as the smoke test's `plugins` cast).
export async function runCommand(commandId: string): Promise<void> {
  await browser.executeObsidian(({ app }, id) => {
    const runtime = app as unknown as { commands: { executeCommandById(id: string): boolean } };
    runtime.commands.executeCommandById(id);
  }, commandId);
}

// Obsidian's command palette and the plugin's own SuggestModals share one DOM shape:
// a `.prompt` with a text input and `.suggestion-item` rows. These helpers drive both.
const PROMPT = ".prompt";

// Open the palette through Obsidian's own built-in command id — the one sanctioned
// executeCommandById in slice B, as setup. The click path under test is the palette's own
// filter+choose: the palette omits commands whose check() returns false, which a direct
// executeCommandById of our command would bypass.
export async function openPalette(): Promise<void> {
  await runCommand("command-palette:open");
  await $(`${PROMPT} input`).waitForExist({ timeoutMsg: "command palette did not open" });
}

export async function promptType(text: string): Promise<void> {
  await $(`${PROMPT} input`).setValue(text);
}

export function promptItem(text: string): ReturnType<typeof $> {
  return $(PROMPT).$(`.suggestion-item*=${text}`);
}

// Filter the active prompt to `text` and choose the matching suggestion. The palette lists a
// plugin command as "Journals: <name>", so the partial match survives the prefix.
export async function promptChoose(text: string): Promise<void> {
  await promptType(text);
  const item = promptItem(text);
  await item.waitForClickable({ timeoutMsg: `prompt did not list "${text}"` });
  await item.click();
}

// A SuggestModal sets its own input placeholder; waiting on it distinguishes a freshly opened
// suggest from the palette prompt that just closed (both render as `.prompt`).
export async function waitForPrompt(placeholder: string): Promise<void> {
  await $(`${PROMPT} input[placeholder="${placeholder}"]`).waitForExist({
    timeoutMsg: `prompt with placeholder "${placeholder}" did not open`,
  });
}

export async function closePalette(): Promise<void> {
  await browser.keys("Escape");
  await $(PROMPT).waitForExist({ reverse: true, timeoutMsg: "command palette did not close" });
}

// Whether the palette lists `text` after filtering to it — the real check() gate, since the
// palette omits commands whose check() returns false. Opens, filters, reads once, closes.
export async function paletteLists(text: string): Promise<boolean> {
  await openPalette();
  await promptType(text);
  const present = await promptItem(text).isExisting();
  await closePalette();
  return present;
}
