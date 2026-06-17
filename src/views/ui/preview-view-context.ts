import { computed } from "vue";

import { Clock, type AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";

import { provideViewContext } from "../view-context";
import { ViewsViewModel } from "../view-model";

import type { ViewId } from "../config";

function noop(): void {
  // Preview context is inert: ref-date and shelf are fixed, so the setters do nothing.
}

export function provideViewPreviewContext(viewId: ViewId): void {
  const viewsVM = useService(ViewsViewModel);
  const view = computed(() => viewsVM.getView(viewId).getOr(undefined as never));
  provideViewContext({
    viewId,
    viewName: computed(() => view.value?.name ?? ""),
    refDate: computed(() => Clock.now().format("YYYY-MM-DD") as AnchorString),
    shelf: computed(() => view.value?.defaultShelf ?? null),
    setRefDate: noop,
    setShelf: noop,
  });
}
