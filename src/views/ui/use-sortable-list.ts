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
    // useSortable's default onUpdate applies the reordered array to `list` only on
    // nextTick, but SortableJS fires onEnd synchronously — reading `list.value` here
    // would see the pre-drag order. Derive the new order from the drag indices instead.
    onEnd: (event) => {
      const { oldIndex, newIndex } = event;
      if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;
      const orderedIds = list.value.map((item) => item.id);
      const [moved] = orderedIds.splice(oldIndex, 1);
      orderedIds.splice(newIndex, 0, moved);
      onReorder(orderedIds);
    },
  });
}
