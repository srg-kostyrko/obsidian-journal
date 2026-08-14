import type { Component } from "vue";

export interface DashboardBlock {
  readonly key: string;
  readonly component: Component;
  readonly order: number;
}

export function defineDashboardBlock(block: DashboardBlock): DashboardBlock {
  return block;
}

export interface Subpage<TProps> {
  readonly key: string;
  readonly component: Component;
  readonly __props: (witness: never) => TProps;
}

export type AnySubpage = Subpage<unknown>;

export interface SubpageDefinitionInput {
  readonly key: string;
  readonly component: Component;
}

export function defineSubpage<TProps = void>(input: SubpageDefinitionInput): Subpage<TProps> {
  return {
    key: input.key,
    component: input.component,
    __props: (witness: never): TProps => witness,
  };
}

export interface SubpageNav<TProps = void> {
  back(): void;
  push<TPushed>(subpage: Subpage<TPushed>, props: TPushed): void;
  // A subpage that identifies its entity by name has to re-point its own frame when that entity
  // is renamed: the old name stops resolving, so the frame would otherwise pop the user out.
  replace(props: TProps): void;
}
