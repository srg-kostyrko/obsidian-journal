import { inject as vueInject, provide as vueProvide, type InjectionKey, type Ref } from "vue";

import type { AnchorString } from "@/calendar/types";

import { MissingViewContextProviderError } from "./errors";

import type { ViewId } from "./config";

export type RefDateOrigin = "navigate" | "follow" | "select";

export interface ViewContext {
  readonly viewId: ViewId;
  readonly viewName: Readonly<Ref<string>>;
  readonly refDate: Readonly<Ref<AnchorString>>;
  // How the current refDate arrived: explicit navigation, a note opening, or a date the user
  // picked out of a grid. Calendar blocks re-center their window on the first and re-lay-out
  // for the other two only when the date fell outside what they already show.
  readonly refDateOrigin: Readonly<Ref<RefDateOrigin>>;
  readonly followActiveDate: Readonly<Ref<boolean>>;
  readonly shelf: Readonly<Ref<string | null>>;
  // The settings-page preview renders items detached from any live journal scope. Items use
  // this to show their configured shape (e.g. as placeholders) instead of self-hiding.
  readonly preview: boolean;
  setRefDate(date: AnchorString): void;
  // Moves the date without asking the calendars to re-center on it.
  selectRefDate(date: AnchorString): void;
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
