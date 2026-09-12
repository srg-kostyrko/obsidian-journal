/// <reference lib="dom" />

import { cleanup } from "@testing-library/vue";
import { afterEach } from "vitest";

// Workers share one happy-dom document across the files they run, so a component left mounted
// answers the next test's queries. This lives here rather than in vitest.setup.shared.ts because
// the "isolated" project loads only this file, and every file in it would otherwise have to
// remember its own cleanup.
afterEach(cleanup);

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

// Obsidian augments Node and UIEvent with `instanceOf()`, a cross-window-safe instanceof that
// compares against the constructors of the node's own window. happy-dom runs one window, so a
// plain instanceof is the right answer here — what the shim buys is that production code can use
// the cross-window-safe call everywhere instead of a plain instanceof that breaks in a popout window.
function instanceOf<T>(this: unknown, type: new (...data: never[]) => T): boolean {
  return this instanceof type;
}

Object.assign(Node.prototype, { instanceOf });
Object.assign(UIEvent.prototype, { instanceOf });

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
