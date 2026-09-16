import * as v from "valibot";

import { inject } from "@/infrastructure/di";
import { PluginSettingsReader } from "@/infrastructure/host";

import { normalizeFolder, SOURCE_DEFAULT_FORMATS, templatesOf, type ImportSource, type SourceRead } from "../source";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const optionsSchema = v.object({
  weekStart: v.optional(v.picklist(["locale", ...WEEKDAYS]), "locale"),
  showWeeklyNote: v.optional(v.boolean(), false),
  weeklyNoteFormat: v.optional(v.string(), ""),
  weeklyNoteFolder: v.optional(v.string(), ""),
  weeklyNoteTemplate: v.optional(v.string(), ""),
});

export class CalendarSource implements ImportSource {
  readonly #reader = inject(PluginSettingsReader);
  readonly id = "calendar" as const;

  read(): SourceRead {
    const plugin = this.#reader.communityPlugin(this.id);
    if (plugin.isNone()) return { kind: "absent" };
    const parsed = v.safeParse(optionsSchema, (plugin.value as { options?: unknown }).options ?? {});
    if (!parsed.success) return { kind: "unrecognised", source: this.id };
    const options = parsed.output;
    return {
      kind: "read",
      reading: {
        source: this.id,
        configured: true,
        weekStart:
          options.weekStart === "locale"
            ? { kind: "locale" }
            : { kind: "day", dow: WEEKDAYS.indexOf(options.weekStart) },
        journals: options.showWeeklyNote
          ? [
              {
                source: this.id,
                period: "week",
                folder: normalizeFolder(options.weeklyNoteFolder),
                format: options.weeklyNoteFormat.trim() || SOURCE_DEFAULT_FORMATS.week,
                templates: templatesOf(options.weeklyNoteTemplate),
                openAtStartup: false,
              },
            ]
          : [],
      },
    };
  }
}
