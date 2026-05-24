import type { ModalDefinition, ModalDefinitionInput } from "./types";

export function defineModal<TResult = void>(): <TProps>(
  input: ModalDefinitionInput<TProps, TResult>,
) => ModalDefinition<TProps, TResult> {
  return <TProps>(input: ModalDefinitionInput<TProps, TResult>): ModalDefinition<TProps, TResult> => {
    const rawWidth = input.width;
    let width: ((props: TProps) => number) | undefined;
    if (rawWidth === undefined) {
      width = undefined;
    } else if (typeof rawWidth === "function") {
      width = rawWidth;
    } else {
      width = () => rawWidth;
    }

    const rawCssClass = input.cssClass;
    let cssClass: readonly string[];
    if (rawCssClass === undefined) {
      cssClass = [];
    } else if (typeof rawCssClass === "string") {
      cssClass = [rawCssClass];
    } else {
      cssClass = rawCssClass;
    }

    return {
      component: input.component,
      title: input.title,
      width,
      cssClass,
      __result: (witness: never): TResult => witness,
    };
  };
}
