import type { JournalSettings } from "@/types/settings.types";

export interface HomeCodeBlockConfig {
  show: JournalSettings["write"]["type"][];
  separator: string;
  shelf?: string;
  scale: number;
}
