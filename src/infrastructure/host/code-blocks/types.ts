import { createMultiToken } from "@/infrastructure/di";

import type { VaultPath } from "../types";
import type { GenericSchema, InferOutput } from "valibot";
import type { Component } from "vue";

export interface CodeBlockProps<TConfig> {
  readonly path: VaultPath;
  readonly config: TConfig;
}

export interface CodeBlockDefinitionInput<TSchema extends GenericSchema> {
  readonly keys: readonly [string, ...string[]];
  readonly schema: TSchema;
  readonly component: Component;
  readonly cssClass?: readonly string[];
}

export type CodeBlockDefinition<TSchema extends GenericSchema = GenericSchema> = CodeBlockDefinitionInput<TSchema>;

export type CodeBlockConfig<TDefinition> = TDefinition extends CodeBlockDefinition<infer S> ? InferOutput<S> : never;

export const CodeBlockDefinitionToken = createMultiToken<CodeBlockDefinition>("host.codeBlock");
