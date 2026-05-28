import type { BlockInstanceId } from "./config";
import type { BaseIssue, BaseSchema } from "valibot";
import type { Component } from "vue";

export interface ViewBlockProps<TConfig> {
  readonly instanceId: BlockInstanceId;
  readonly config: TConfig;
}

export interface ViewBlockDefinitionInput<TConfig> {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly icon?: string;
  readonly schema: BaseSchema<unknown, TConfig, BaseIssue<unknown>>;
  readonly defaultConfig: TConfig;
  readonly component: Component<ViewBlockProps<TConfig>>;
  readonly configComponent?: Component<{ config: TConfig; onChange: (next: TConfig) => void }>;
  readonly cssClass?: string | readonly string[];
}

export interface ViewBlockDefinition<TConfig = unknown> extends ViewBlockDefinitionInput<TConfig> {
  readonly __brand: "view-block";
}

export function defineViewBlock<TConfig>(input: ViewBlockDefinitionInput<TConfig>): ViewBlockDefinition<TConfig> {
  return { ...input, __brand: "view-block" };
}
