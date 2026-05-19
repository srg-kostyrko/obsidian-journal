import type { SuggestDefinition, SuggestDefinitionInput } from "./types";

export function defineSuggest<TInput, TResult>(
  input: SuggestDefinitionInput<TInput, TResult>,
): SuggestDefinition<TInput, TResult> {
  return {
    placeholder: input.placeholder,
    fetch: input.fetch,
    render: input.render,
    __result: (witness: never): TResult => witness,
  };
}
