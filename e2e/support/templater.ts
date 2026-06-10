import { browser } from "@wdio/globals";

// Helpers for slice D — the Templater interop seam. A real Templater plugin boots
// alongside ours; firing a journal command runs the real template chain
// (TemplateEngine -> TemplaterService.apply -> parse_template) and, on create,
// TemplaterService.cursorJump -> editor_handler.jump_to_next_cursor_location.
// None of this is reachable through __mocks__/obsidian.ts, whose getPlugin returns
// nothing so <% %> is never evaluated. Mechanics live here; specs read as intent.

export interface EditorCursor {
  line: number;
  ch: number;
}

// `commands` is part of Obsidian's runtime but not its public typings (same shape
// as the smoke test's `plugins` cast).
export async function runCommand(commandId: string): Promise<void> {
  await browser.executeObsidian(({ app }, id) => {
    const runtime = app as unknown as { commands: { executeCommandById(id: string): boolean } };
    runtime.commands.executeCommandById(id);
  }, commandId);
}

export function activeNotePath(): Promise<string | undefined> {
  return browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.path);
}

// Reads what Obsidian has parsed, not raw bytes — consistent with slice A/C.
export async function contentOf(path: string): Promise<string | undefined> {
  return browser.executeObsidian(async ({ app, obsidian }, notePath) => {
    const file = app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof obsidian.TFile)) return;
    return app.vault.cachedRead(file);
  }, path);
}

// The live editor document — more current than cachedRead after the cursor jump
// rewrites the open note in place.
export function editorValue(): Promise<string | undefined> {
  return browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue());
}

export function cursorOf(): Promise<EditorCursor | undefined> {
  return browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getCursor());
}

// A command opens today's note under the journal's folder. The date is "today" at
// run time, so we never predict the path — we wait for the active file to land
// under the expected folder, robust against any stale active file from boot.
export async function waitForActiveNoteIn(folder: string): Promise<string> {
  let path = "";
  await browser.waitUntil(
    async () => {
      path = (await activeNotePath()) ?? "";
      return path.startsWith(`${folder}/`);
    },
    { timeoutMsg: `waited for a journal note to open under ${folder}/` },
  );
  return path;
}

export async function waitForContent(
  path: string,
  predicate: (content: string) => boolean,
  timeoutMsg: string,
): Promise<void> {
  await browser.waitUntil(
    async () => {
      const content = await contentOf(path);
      return content !== undefined && predicate(content);
    },
    { timeoutMsg },
  );
}

export async function waitForCursorLine(line: number, timeoutMsg: string): Promise<void> {
  await browser.waitUntil(
    async () => {
      const cursor = await cursorOf();
      return cursor?.line === line;
    },
    { timeoutMsg },
  );
}
