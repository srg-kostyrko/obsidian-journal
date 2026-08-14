import { browser } from "@wdio/globals";

import { waitForState } from "./wait.js";

export interface EditorCursor {
  line: number;
  ch: number;
}

export function cursorOf(): Promise<EditorCursor | undefined> {
  return browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getCursor());
}

// The live editor document — more current than vault.cachedRead after a cursor
// jump rewrites the open note in place.
export function editorValue(): Promise<string | undefined> {
  return browser.executeObsidian(({ app }) => app.workspace.activeEditor?.editor?.getValue());
}

export function waitForCursorLine(line: number, timeoutMsg: string): Promise<void> {
  return waitForState(cursorOf, (cursor) => cursor.line === line, timeoutMsg);
}
