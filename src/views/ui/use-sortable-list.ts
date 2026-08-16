import { useSortable } from "@vueuse/integrations/useSortable";
import { ref, type Ref } from "vue";

export interface SortableListOptions {
  // Sharing a group name across multiple useSortableList calls lets items cross between
  // their containers; omit it to keep a list self-contained (the original behavior).
  group?: string;
  // Restricts which direct children SortableJS treats as items, so non-item content sharing
  // the same container (e.g. a trailing toolbar) never becomes part of the drag order.
  draggable?: string;
}

function idsInDomOrder(container: HTMLElement): string[] {
  return Array.from(container.children, (child) =>
    child.instanceOf(HTMLElement) ? child.dataset.id : undefined,
  ).filter((id): id is string => id !== undefined);
}

export function useSortableList<T extends { id: string }>(
  el: Ref<HTMLElement | null>,
  list: Ref<T[]>,
  onReorder: (orderedIds: string[]) => void,
  options: SortableListOptions = {},
): { dragging: Ref<boolean> } {
  const dragging = ref(false);
  useSortable(el, list, {
    handle: "[data-drag-handle]",
    animation: 150,
    group: options.group,
    draggable: options.draggable,
    onStart: () => {
      dragging.value = true;
    },
    // useSortable's default onUpdate applies the reordered array to `list` only on
    // nextTick, but SortableJS fires onEnd synchronously — reading `list.value` here
    // would see the pre-drag order. Derive the new order from the drag indices instead.
    // SortableJS never fires 'end' for a cross-container move (only 'add'/'remove'/'sort'),
    // so this only ever runs for a same-container reorder; onAdd below covers the rest.
    onEnd: (event) => {
      dragging.value = false;
      const { oldIndex, newIndex, from, to } = event;
      if (from !== to) return;
      if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;
      const orderedIds = list.value.map((item) => item.id);
      const [moved] = orderedIds.splice(oldIndex, 1);
      if (moved !== undefined) orderedIds.splice(newIndex, 0, moved);
      onReorder(orderedIds);
    },
    // Fires only on the container that received a cross-container drop. SortableJS has
    // already moved the dragged element under `event.to` by this point — read the
    // resulting order before undoing that physical move, so Vue's own reactive re-render
    // (driven by onReorder mutating the source data) is the only thing that ever actually
    // moves a Vue-owned DOM node. Left un-reverted, the raw node SortableJS moved would sit
    // in the target as an untracked orphan, invisible to Vue's own diffing.
    onAdd: options.group
      ? (event) => {
          dragging.value = false;
          const orderedIds = idsInDomOrder(event.to);
          event.item.remove();
          event.from.insertBefore(event.item, event.from.children[event.oldIndex ?? 0] ?? null);
          onReorder(orderedIds);
        }
      : undefined,
    onRemove: () => {
      dragging.value = false;
    },
  });
  return { dragging };
}
