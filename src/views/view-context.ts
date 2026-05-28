import { inject as vueInject, provide as vueProvide, type InjectionKey, type Ref } from "vue";

import type { AnchorString } from "@/calendar/types";

import { MissingViewContextProviderError } from "./errors";

import type { ViewId } from "./config";

export interface ViewContext {
  readonly viewId: ViewId;
  readonly viewName: Readonly<Ref<string>>;
  readonly refDate: Readonly<Ref<AnchorString>>;
  readonly shelf: Readonly<Ref<string | null>>;
  setRefDate(date: AnchorString): void;
  setShelf(shelf: string | null): void;
}

export const ViewContextKey: InjectionKey<ViewContext> = Symbol("views.ViewContext");

export function provideViewContext(context: ViewContext): void {
  vueProvide(ViewContextKey, context);
}

export function useViewContext(): ViewContext {
  const context = vueInject(ViewContextKey);
  if (!context) throw new MissingViewContextProviderError();
  return context;
}
