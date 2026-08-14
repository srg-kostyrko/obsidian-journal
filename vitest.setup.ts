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
// Suggestion renderers and code-block panels build their DOM with them, so tests need the
// same shape.
interface DomElementInfo {
  text?: string;
  cls?: string;
}

function createEl(this: HTMLElement, tag: string, options?: DomElementInfo): HTMLElement {
  const element = window.document.createElement(tag);
  if (options?.text !== undefined) element.textContent = options.text;
  if (options?.cls !== undefined) element.className = options.cls;
  this.append(element);
  return element;
}

Object.assign(HTMLElement.prototype, {
  setText(this: HTMLElement, text: string): void {
    this.textContent = text;
  },
  createEl,
  createDiv(this: HTMLElement, options?: DomElementInfo): HTMLElement {
    return createEl.call(this, "div", options);
  },
  createSpan(this: HTMLElement, options?: DomElementInfo): HTMLElement {
    return createEl.call(this, "span", options);
  },
});
