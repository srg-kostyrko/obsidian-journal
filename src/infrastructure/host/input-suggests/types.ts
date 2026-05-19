export interface InputSuggestDefinitionInput<TResult> {
  fetch: (query: string) => TResult[];
  render: (item: TResult, element: HTMLElement) => string | undefined;
  toValue: (item: TResult) => string;
}

export interface InputSuggestDefinition<TResult> {
  readonly fetch: (query: string) => TResult[];
  readonly render: (item: TResult, element: HTMLElement) => string | undefined;
  readonly toValue: (item: TResult) => string;
  readonly __result: (witness: never) => TResult;
}
