import * as v from "valibot";

import { inject } from "@/infrastructure/di";
import { PluginSettingsReader } from "@/infrastructure/host";

import {
  normalizeFolder,
  PERIOD_KINDS,
  SOURCE_DEFAULT_FORMATS,
  templatesOf,
  type ImportSource,
  type PeriodKind,
  type SourceJournal,
  type SourceRead,
} from "../source";

const periodicConfigSchema = v.object({
  enabled: v.optional(v.boolean(), false),
  openAtStartup: v.optional(v.boolean(), false),
  format: v.optional(v.string(), ""),
  folder: v.optional(v.string(), ""),
  templatePath: v.optional(v.string(), ""),
});

const calendarSetSchema = v.object({
  id: v.string(),
  day: v.optional(periodicConfigSchema),
  week: v.optional(periodicConfigSchema),
  month: v.optional(periodicConfigSchema),
  quarter: v.optional(periodicConfigSchema),
  year: v.optional(periodicConfigSchema),
});

const currentSettingsSchema = v.object({ calendarSets: v.array(calendarSetSchema) });

const legacyPeriodSchema = v.object({
  enabled: v.optional(v.boolean(), false),
  format: v.optional(v.string(), ""),
  folder: v.optional(v.string(), ""),
  template: v.optional(v.string(), ""),
});

const LEGACY_KEYS = {
  day: "daily",
  week: "weekly",
  month: "monthly",
  quarter: "quarterly",
  year: "yearly",
} as const satisfies Record<PeriodKind, string>;

const legacySettingsSchema = v.object({
  daily: v.optional(legacyPeriodSchema),
  weekly: v.optional(legacyPeriodSchema),
  monthly: v.optional(legacyPeriodSchema),
  quarterly: v.optional(legacyPeriodSchema),
  yearly: v.optional(legacyPeriodSchema),
});

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// A Svelte store calls its subscriber synchronously with the current value, so subscribing and
// unsubscribing at once reads it without importing svelte.
function unwrapStore(value: unknown): unknown {
  if (!isObject(value) || typeof value.subscribe !== "function") return value;
  let current: unknown;
  const unsubscribe: unknown = (value.subscribe as (run: (next: unknown) => void) => unknown)((next) => {
    current = next;
  });
  if (typeof unsubscribe === "function") (unsubscribe as () => void)();
  return current;
}

function sourceJournal(
  period: PeriodKind,
  config: { folder: string; format: string; template: string; openAtStartup: boolean },
  set?: string,
): SourceJournal {
  return {
    source: "periodic-notes",
    ...(set !== undefined && { set }),
    period,
    folder: normalizeFolder(config.folder),
    format: config.format.trim() || SOURCE_DEFAULT_FORMATS[period],
    templates: templatesOf(config.template),
    openAtStartup: config.openAtStartup,
  };
}

// Periodic Notes opens one note at startup: the first flagged period, walking sets in order and
// day before week before month. Every other flag is inert there, so it stays inert here.
function firstStartupOnly(journals: SourceJournal[]): SourceJournal[] {
  const first = journals.findIndex((journal) => journal.openAtStartup);
  return journals.map((journal, index) =>
    journal.openAtStartup && index !== first ? { ...journal, openAtStartup: false } : journal,
  );
}

export class PeriodicNotesSource implements ImportSource {
  readonly #reader = inject(PluginSettingsReader);
  readonly id = "periodic-notes" as const;

  read(): SourceRead {
    const plugin = this.#reader.communityPlugin(this.id);
    if (plugin.isNone()) return { kind: "absent" };
    const settings = unwrapStore((plugin.value as { settings?: unknown }).settings);
    if (!isObject(settings)) return { kind: "unrecognised", source: this.id };

    // 1.x writes its calendar sets back beside the 0.x keys it migrated from, so the sets decide.
    if ("calendarSets" in settings) {
      const current = v.safeParse(currentSettingsSchema, settings);
      if (!current.success) return { kind: "unrecognised", source: this.id };
      const journals = current.output.calendarSets.flatMap((set) =>
        PERIOD_KINDS.flatMap((period) => {
          const config = set[period];
          if (!config?.enabled) return [];
          return [sourceJournal(period, { ...config, template: config.templatePath }, set.id)];
        }),
      );
      return {
        kind: "read",
        reading: { source: this.id, variant: "1.x", configured: true, journals: firstStartupOnly(journals) },
      };
    }

    const legacy = v.safeParse(legacySettingsSchema, settings);
    if (!legacy.success) return { kind: "unrecognised", source: this.id };
    const journals = PERIOD_KINDS.flatMap((period) => {
      const config = legacy.output[LEGACY_KEYS[period]];
      if (!config?.enabled) return [];
      return [sourceJournal(period, { ...config, openAtStartup: false })];
    });
    return { kind: "read", reading: { source: this.id, variant: "0.x", configured: true, journals } };
  }
}
