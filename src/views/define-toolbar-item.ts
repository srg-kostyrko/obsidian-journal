import type { BlockInstanceId } from "./config";
import type { BaseIssue, BaseSchema } from "valibot";
import type { Component } from "vue";

export interface ToolbarItemProps<TConfig> {
  readonly instanceId: BlockInstanceId;
  readonly config: TConfig;
}

export interface ToolbarItemPreset<TConfig> {
  readonly label: string;
  readonly defaultConfig: TConfig;
}

export interface ToolbarItemDefinitionInput<TConfig> {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: string;
  readonly schema: BaseSchema<unknown, TConfig, BaseIssue<unknown>>;
  readonly defaultConfig: TConfig;
  readonly component: Component;
  readonly configComponent?: Component;
  readonly presets?: readonly ToolbarItemPreset<TConfig>[];
  // A config-specific name for this instance (e.g. "Today" vs "Pick a date" for a button), used
  // where the generic label is too coarse — such as the edit modal title.
  readonly summary?: (config: TConfig) => string | undefined;
}

export interface ToolbarItemDefinition<TConfig = unknown> extends Omit<ToolbarItemDefinitionInput<TConfig>, "summary"> {
  readonly __brand: "toolbar-item";
  readonly summary?: (config: unknown) => string | undefined;
}

export function defineToolbarItem<TConfig>(input: ToolbarItemDefinitionInput<TConfig>): ToolbarItemDefinition<TConfig> {
  return { ...input, __brand: "toolbar-item" } as ToolbarItemDefinition<TConfig>;
}
