export interface InputSuggestDefinitionInput<TResult> {
  fetch: (query: string) => TResult[];
  render: (item: TResult, element: HTMLElement) => string | undefined;
  toValue: (item: TResult) => string;
}

export interface InputSuggestDefinition<TResult> {
  readonly fetch: (query: string) => TResult[];
  // Method-shorthand (not function-property) so the function parameters become
  // bivariant under strictFunctionTypes. @testing-library/vue's render() resolves
  // ComponentProps<...> with TResult=unknown, so without bivariance an
  // `InputSuggestDefinition<string>` won't assign to the component's prop.
  render(item: TResult, element: HTMLElement): string | undefined;
  toValue(item: TResult): string;
  readonly __result: (witness: never) => TResult;
}

export type Disposer = () => void;
