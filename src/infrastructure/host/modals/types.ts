import type { Component } from "vue";

export interface ModalDefinitionInput<TProps> {
  component: Component;
  title: (props: TProps) => string;
  width?: number | ((props: TProps) => number);
  cssClass?: string | readonly string[];
}

export interface ModalDefinition<TProps, TResult> {
  readonly component: Component;
  readonly title: (props: TProps) => string;
  readonly width: ((props: TProps) => number) | undefined;
  readonly cssClass: readonly string[];
  readonly __result: (witness: never) => TResult;
}

export interface ModalApi<TResult> {
  submit: (value: TResult) => void;
  cancel: () => void;
}
