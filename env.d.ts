/// <reference types="vite/client" />

// Augment the obsidian module to expose the __testing registry used in unit tests.
// The actual implementation lives in __mocks__/obsidian.ts (aliased by vitest).
import type { Modal } from "obsidian";

declare module "obsidian" {
  export const __testing: {
    readonly openModals: readonly Modal[];
    lastOpenModal(): Modal;
    reset(): void;
  };
}
