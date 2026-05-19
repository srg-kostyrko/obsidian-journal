import type { InputSuggestDefinition, InputSuggestDefinitionInput } from "./types";

export function defineInputSuggest<TResult>(
  input: InputSuggestDefinitionInput<TResult>,
): InputSuggestDefinition<TResult> {
  return {
    fetch: input.fetch,
    render: input.render,
    toValue: input.toValue,
    __result: (witness: never): TResult => witness,
  };
}
