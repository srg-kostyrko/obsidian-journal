/// <reference lib="dom" />

// Obsidian injects `activeDocument` as a global pointing to the document of the
// currently focused window (main or popout). happy-dom only provides `document`,
// so production code that calls `activeDocument.*` would crash in tests without
// this shim. See https://docs.obsidian.md/Reference/TypeScript+API/activeDocument
Object.defineProperty(window, "activeDocument", {
  configurable: true,
  get: (): Document => window.document,
});
