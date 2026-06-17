import { useSortable } from "@vueuse/integrations/useSortable";

import type { Ref } from "vue";

export function useSortableList<T extends { id: string }>(
  el: Ref<HTMLElement | null>,
  list: Ref<T[]>,
  onReorder: (orderedIds: string[]) => void,
): void {
  useSortable(el, list, {
    handle: "[data-drag-handle]",
    animation: 150,
    onEnd: () => onReorder(list.value.map((item) => item.id)),
  });
}
