import { useSortable } from "@vueuse/integrations/useSortable";
import { ref, type Ref } from "vue";

export interface SortableListOptions {
  // Sharing a group name across multiple useSortableList calls lets items cross between
  // their containers; omit it to keep a list self-contained (the original behavior).
  group?: string;
  // Restricts which direct children SortableJS treats as items, so non-item content sharing
  // the same container (e.g. a trailing toolbar) never becomes part of the drag order.
  draggable?: string;
  // Called synchronously from SortableJS's own callbacks, never through `dragging` plus a
  // `watch` — a watch is a queued job, and a drag that empties its own source container can
  // have that container's component unmounted (stopping its effect scope) before the queued
  // job runs, silently swallowing the event.
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

function idsInDomOrder(container: HTMLElement): string[] {
  // Plain instanceof, not Obsidian's cross-window-safe .instanceOf(): that method only
  // exists once the real app installs it, so it throws under the test environment's DOM.
  return Array.from(container.children, (child) =>
    child instanceof HTMLElement ? child.dataset.id : undefined,
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
    // `el` can still be null at this component's own mount (e.g. an element owned by an
    // ancestor and handed down through props/slots, not yet propagated on the first render);
    // watchElement re-initializes Sortable once it resolves instead of a one-shot mount read.
    watchElement: true,
    handle: "[data-drag-handle]",
    animation: 150,
    // useSortable's own default onUpdate writes the reordered array back into `list` via
    // moveArrayElement — but onEnd/onAdd below already derive and apply the real reorder from
    // drag indices, so that write is both redundant and, whenever a caller's `list` is a
    // computed view-model (no setter), a "computed value is readonly" warning on every
    // same-container drag. No-op it unconditionally rather than relying on every caller to
    // remember `list` must be writable.
    onUpdate: () => {
      // Deliberately empty — see comment above.
    },
    // SortableJS applies its own default for an option only when the key is absent
    // (`!(name in options)`), so passing `group: undefined`/`draggable: undefined` outright —
    // rather than omitting the key — suppresses its `draggable: '>*'` default and breaks
    // dragging for every caller that doesn't pass these, not just the ones that do.
    ...(options.group !== undefined && { group: options.group }),
    ...(options.draggable !== undefined && { draggable: options.draggable }),
    onStart: () => {
      dragging.value = true;
      options.onDragStart?.();
    },
    // useSortable's default onUpdate applies the reordered array to `list` only on
    // nextTick, but SortableJS fires onEnd synchronously — reading `list.value` here
    // would see the pre-drag order. Derive the new order from the drag indices instead.
    // onEnd always fires on the drag's source instance, cross-container or not; the
    // from/to guard is what actually distinguishes a cross-container drop (handled by
    // onAdd below instead, since only the target instance can see the final DOM order).
    onEnd: (event) => {
      dragging.value = false;
      options.onDragEnd?.();
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
    onAdd: (event) => {
      if (!options.group) return;
      dragging.value = false;
      const orderedIds = idsInDomOrder(event.to);
      event.item.remove();
      event.from.insertBefore(event.item, event.from.children[event.oldIndex ?? 0] ?? null);
      onReorder(orderedIds);
    },
  });
  return { dragging };
}
