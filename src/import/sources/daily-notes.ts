import * as v from "valibot";

import { inject } from "@/infrastructure/di";
import { PluginSettingsReader } from "@/infrastructure/host";

import { normalizeFolder, SOURCE_DEFAULT_FORMATS, templatesOf, type ImportSource, type SourceRead } from "../source";

const optionsSchema = v.object({
  folder: v.optional(v.string(), ""),
  format: v.optional(v.string(), ""),
  template: v.optional(v.string(), ""),
});

export class DailyNotesSource implements ImportSource {
  readonly #reader = inject(PluginSettingsReader);
  readonly id = "daily-notes" as const;

  read(): SourceRead {
    const plugin = this.#reader.corePlugin(this.id);
    if (plugin.isNone()) return { kind: "absent" };
    const parsed = v.safeParse(optionsSchema, (plugin.value as { options?: unknown }).options ?? {});
    if (!parsed.success) return { kind: "unrecognised", source: this.id };
    const { folder, format, template } = parsed.output;
    return {
      kind: "read",
      reading: {
        source: this.id,
        configured: [folder, format, template].some((field) => field.trim() !== ""),
        journals: [
          {
            source: this.id,
            period: "day",
            folder: normalizeFolder(folder),
            format: format.trim() || SOURCE_DEFAULT_FORMATS.day,
            templates: templatesOf(template),
            // Obsidian turns `autorun` into a vault setting and deletes it the moment the plugin
            // is enabled, so a live read never has it.
            openAtStartup: false,
          },
        ],
      },
    };
  }
}
