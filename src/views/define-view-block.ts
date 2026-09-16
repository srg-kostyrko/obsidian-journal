import * as v from "valibot";

import type { BlockInstanceId } from "./config";
import type { BaseIssue, BaseSchema } from "valibot";
import type { Component } from "vue";

export interface ViewBlockProps<TConfig> {
  readonly instanceId: BlockInstanceId;
  readonly config: TConfig;
}

export interface ViewBlockDefinitionInput<TConfig> {
  readonly key: string;
  // Factories rather than values: they resolve paraglide messages, which read the active locale
  // only after JournalPlugin.onload() runs — evaluating them at module-evaluation time would
  // freeze the text in the base locale.
  readonly label: () => string;
  readonly description?: () => string;
  readonly icon?: string;
  readonly schema: BaseSchema<unknown, TConfig, BaseIssue<unknown>>;
  readonly defaultConfig: TConfig;
  readonly component: Component;
  readonly configComponent?: Component;
  readonly cssClass?: string | readonly string[];
  readonly summary?: (config: TConfig) => string | undefined;
}

export interface ViewBlockDefinition<TConfig = unknown> extends Omit<ViewBlockDefinitionInput<TConfig>, "summary"> {
  readonly __brand: "view-block";
  readonly summary?: (config: unknown) => string | undefined;
}

export function defineViewBlock<TConfig>(input: ViewBlockDefinitionInput<TConfig>): ViewBlockDefinition<TConfig> {
  const { schema, summary } = input;
  // A stored block config is persisted unparsed — viewBlockInstanceSchema keeps it a bare record —
  // so a summary reading it raw sees whatever a past version wrote: the legacy "current-month"
  // window every vault seeded before 3.5 still holds, or a field the schema would have defaulted.
  // Either matches no variant of a selector message, which then renders as its own key.
  const safeSummary =
    summary &&
    ((config: unknown): string | undefined => {
      const parsed = v.safeParse(schema, config);
      return parsed.success ? summary(parsed.output) : undefined;
    });
  return { ...input, summary: safeSummary, __brand: "view-block" };
}
