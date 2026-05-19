export interface SuggestDefinitionInput<TInput, TResult> {
  placeholder?: (input: TInput) => string;
  fetch: (query: string, input: TInput) => TResult[] | Promise<TResult[]>;
  render: (item: TResult, element: HTMLElement) => string | undefined;
}

export interface SuggestDefinition<TInput, TResult> {
  readonly placeholder: ((input: TInput) => string) | undefined;
  readonly fetch: (query: string, input: TInput) => TResult[] | Promise<TResult[]>;
  readonly render: (item: TResult, element: HTMLElement) => string | undefined;
  readonly __result: (witness: never) => TResult;
}
