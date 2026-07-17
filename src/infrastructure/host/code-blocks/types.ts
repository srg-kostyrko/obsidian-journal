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
  // The option names this block understands. A fence schema tolerates a typo'd key by
  // ignoring it, which renders a plausible-looking block that quietly does the wrong thing —
  // declaring the names lets the block say which ones it ignored. Opt-in: a block that takes
  // no options (the nav fence reads nothing from its body) must not flag every key.
  readonly knownKeys?: readonly string[];
}

export type CodeBlockDefinition<TSchema extends GenericSchema = GenericSchema> = CodeBlockDefinitionInput<TSchema>;

export type CodeBlockConfig<TDefinition> = TDefinition extends CodeBlockDefinition<infer S> ? InferOutput<S> : never;

export const CodeBlockDefinitionToken = createMultiToken<CodeBlockDefinition>("host.codeBlock");
