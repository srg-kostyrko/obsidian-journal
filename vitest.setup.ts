/// <reference lib="dom" />

// Obsidian injects `activeDocument` as a global pointing to the document of the
// currently focused window (main or popout). happy-dom only provides `document`,
// so production code that calls `activeDocument.*` would crash in tests without
// this shim. See https://docs.obsidian.md/Reference/TypeScript+API/activeDocument
Object.defineProperty(window, "activeDocument", {
  configurable: true,
  get: (): Document => window.document,
});

// Obsidian augments HTMLElement with DOM builder helpers that happy-dom does not provide.
// Suggestion renderers build their rows with them, so tests need the same shape.
Object.assign(HTMLElement.prototype, {
  setText(this: HTMLElement, text: string): void {
    this.textContent = text;
  },
  createSpan(this: HTMLElement, options?: { text?: string; cls?: string }): HTMLSpanElement {
    const span = window.document.createElement("span");
    if (options?.text !== undefined) span.textContent = options.text;
    if (options?.cls !== undefined) span.className = options.cls;
    this.append(span);
    return span;
  },
});
