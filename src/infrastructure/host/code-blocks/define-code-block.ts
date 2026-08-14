import type { CodeBlockDefinition, CodeBlockDefinitionInput } from "./types";
import type { GenericSchema } from "valibot";

export function defineCodeBlock<TSchema extends GenericSchema>(
  input: CodeBlockDefinitionInput<TSchema>,
): CodeBlockDefinition<TSchema> {
  return input;
}
