import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { inject } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { Option } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { FRONTMATTER_NAME_KEY, journalConfigCollection } from "./config";

import type { JournalConfig } from "./config";
import type { JournalEntry } from "./types";

export class FrontmatterService {
  readonly #settings = inject(SettingsService);

  parseEntry(path: VaultPath, frontmatter: Record<string, unknown>): Option<JournalEntry> {
    const journalName = frontmatter[FRONTMATTER_NAME_KEY];
    if (typeof journalName !== "string") return Option.none();
    const config = this.#settings.getCollection(journalConfigCollection).get(journalName) as JournalConfig | undefined;
    if (!config) return Option.none();

    const rawDate = frontmatter[config.frontmatter.dateField];
    if (typeof rawDate !== "string") return Option.none();
    const parsed = CalendarDate.parse(rawDate);
    if (!parsed.isOk()) return Option.none();
    const anchor = parsed.value.toAnchor();

    const rawEnd = frontmatter[config.frontmatter.endDateField];
    let endDate: AnchorString | undefined;
    if (typeof rawEnd === "string") {
      const endParsed = CalendarDate.parse(rawEnd);
      if (endParsed.isOk()) endDate = endParsed.value.toAnchor();
    }

    const numbers: Record<string, number> = {};
    for (const source of config.numbering.sources) {
      const value = frontmatter[source.frontmatterKey];
      if (typeof value === "number" && Number.isFinite(value)) {
        numbers[source.variable] = value;
      }
    }

    const entry: JournalEntry = {
      journalName,
      anchor,
      path,
      ...(endDate === undefined ? {} : { endDate }),
      ...(Object.keys(numbers).length > 0 ? { numbers } : {}),
    };
    return Option.some(entry);
  }
}
