import { createMultiToken } from "@/infrastructure/di";

import type { Component } from "vue";

export interface JournalEditSection {
  readonly key: string;
  readonly component: Component;
  readonly order: number;
}

export function defineJournalEditSection(section: JournalEditSection): JournalEditSection {
  return section;
}

export const JournalEditSectionToken = createMultiToken<JournalEditSection>("journals.editSection");
