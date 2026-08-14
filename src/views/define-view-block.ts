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
  return { ...input, __brand: "view-block" } as ViewBlockDefinition<TConfig>;
}
