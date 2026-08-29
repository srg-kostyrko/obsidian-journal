import { computed, shallowRef } from "vue";

import { Clock, type AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";

import { provideViewContext, type RefDateOrigin } from "../view-context";
import { ViewsViewModel } from "../view-model";

import type { ViewId } from "../config";

function noop(): void {
  // Preview context is inert: ref-date and shelf are fixed, so the setters do nothing.
}

export function provideViewPreviewContext(viewId: ViewId): void {
  const viewsVM = useService(ViewsViewModel);
  const view = computed(() => viewsVM.getView(viewId).getOrUndefined());
  provideViewContext({
    viewId,
    viewName: computed(() => view.value?.name ?? ""),
    refDate: computed(() => Clock.now().format("YYYY-MM-DD") as AnchorString),
    refDateOrigin: shallowRef<RefDateOrigin>("navigate"),
    shelf: computed(() => view.value?.defaultShelf ?? null),
    preview: true,
    setRefDate: noop,
    selectRefDate: noop,
    setShelf: noop,
  });
}
