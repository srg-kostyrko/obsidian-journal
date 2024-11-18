import { type ComputedRef } from "vue";
import type { JournalDecoration, JournalSettings } from "./settings.types";
import type { Journal } from "@/journals/journal";

interface ProvidedDecorationData {
  journalName: string;
  decoration: JournalDecoration;
}

export interface ProvidedShelfData {
  journals: Record<"all" | JournalSettings["write"]["type"], ComputedRef<Journal[]>>;
  decorations: Record<JournalSettings["write"]["type"], ComputedRef<ProvidedDecorationData[]>>;
}
