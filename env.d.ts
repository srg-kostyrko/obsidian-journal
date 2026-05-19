/// <reference types="vite/client" />

import type { CalendarDate } from "@/calendar";

declare module "@vue/reactivity" {
  interface RefUnwrapBailTypes {
    calendarDate: CalendarDate;
  }
}

// Augment the obsidian module to expose the __testing registry used in unit tests.
// The actual implementation lives in __mocks__/obsidian.ts (aliased by vitest).
import type { AbstractInputSuggest, Modal, SuggestModal } from "obsidian";

declare module "obsidian" {
  export const __testing: {
    readonly openModals: readonly Modal[];
    lastOpenModal(): Modal;
    readonly openSuggestModals: readonly SuggestModal<unknown>[];
    lastOpenSuggestModal(): SuggestModal<unknown>;
    readonly attachedInputSuggests: readonly AbstractInputSuggest<unknown>[];
    lastAttachedInputSuggest(): AbstractInputSuggest<unknown>;
    reset(): void;
  };
}
