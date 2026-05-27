import { match } from "ts-pattern";

import { relativeDate, type AnchorString } from "@/calendar";
import type { JournalConfig } from "@/journals";

import type { HomeBlockConfig, HomeEntry } from "./home-config";

export interface HomeItem {
  readonly entry: HomeEntry;
  readonly label: string;
  readonly journalNames: readonly string[];
}

export interface HomeItemContext {
  pathForCustom(journal: JournalConfig, today: AnchorString): string | null;
}

export function buildHomeItems(
  config: Pick<HomeBlockConfig, "show">,
  journals: readonly JournalConfig[],
  today: AnchorString,
  shelf: string | null,
  shelfByJournal: ReadonlyMap<string, string>,
  context: HomeItemContext,
): readonly HomeItem[] {
  const result: HomeItem[] = [];
  const onShelf = (journal: JournalConfig): boolean => shelf === null || shelfByJournal.get(journal.name) === shelf;

  for (const entry of config.show) {
    const items = match(entry)
      .with("custom", () => buildCustomItems(journals, today, onShelf, context))
      .with("day", "week", "month", "quarter", "year", (period) => buildFixedItem(period, journals, today, onShelf))
      .exhaustive();
    result.push(...items);
  }
  return result;
}

function buildFixedItem(
  period: "day" | "week" | "month" | "quarter" | "year",
  journals: readonly JournalConfig[],
  today: AnchorString,
  onShelf: (journal: JournalConfig) => boolean,
): readonly HomeItem[] {
  const matching = journals.filter((journal) => journal.write.type === period && onShelf(journal));
  if (matching.length === 0) return [];
  return [
    {
      entry: period,
      label: relativeDate(period, today, today),
      journalNames: matching.map((journal) => journal.name),
    },
  ];
}

function buildCustomItems(
  journals: readonly JournalConfig[],
  today: AnchorString,
  onShelf: (journal: JournalConfig) => boolean,
  context: HomeItemContext,
): readonly HomeItem[] {
  const items: HomeItem[] = [];
  for (const journal of journals) {
    if (journal.write.type !== "custom") continue;
    if (!onShelf(journal)) continue;
    const label = context.pathForCustom(journal, today);
    if (label === null) continue;
    items.push({ entry: "custom", label, journalNames: [journal.name] });
  }
  return items;
}
