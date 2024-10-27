import { type ComputedRef } from "vue";
import type { JournalDecoration, JournalSettings } from "./settings.types";

interface ProvidedDecorationData {
  journalName: string;
  decoration: JournalDecoration;
}

export interface ProvidedShelfData {
  journals: Record<"all" | JournalSettings["write"]["type"], ComputedRef<JournalSettings[]>>;
  decorations: Record<JournalSettings["write"]["type"], ComputedRef<ProvidedDecorationData[]>>;
}
