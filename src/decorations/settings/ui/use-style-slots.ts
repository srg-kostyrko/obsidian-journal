import { useFieldArray } from "vee-validate";
import { computed, type ComputedRef } from "vue";

import { defaultStyle } from "../../defaults";
import { occupiedSlots, slotIndex, type StyleFor, type StyleSlotKey } from "../../style-slots";

import type { JournalDecorationStyle } from "../../config";

export interface StyleSlots {
  get: <K extends StyleSlotKey>(type: K) => StyleFor<K> | undefined;
  put: <K extends StyleSlotKey>(type: K, style: StyleFor<K>) => void;
  add: <K extends StyleSlotKey>(type: K) => StyleFor<K>;
  remove: (type: StyleSlotKey) => void;
  occupied: ComputedRef<ReadonlySet<StyleSlotKey>>;
}

// The only place that knows a decoration stores its styles as an array. Editing in place by
// index rather than rebuilding the array keeps the stored order, which is observable: a shape
// and an icon sharing one placement render in array order.
export function useStyleSlots(name: string, current: () => readonly JournalDecorationStyle[]): StyleSlots {
  const array = useFieldArray<JournalDecorationStyle>(name);

  function get<K extends StyleSlotKey>(type: K): StyleFor<K> | undefined {
    const index = slotIndex(current(), type);
    return index === -1 ? undefined : (current().at(index) as StyleFor<K>);
  }

  function put<K extends StyleSlotKey>(type: K, style: StyleFor<K>): void {
    const index = slotIndex(current(), type);
    if (index === -1) array.push(style);
    else array.update(index, style);
  }

  function add<K extends StyleSlotKey>(type: K): StyleFor<K> {
    const style = defaultStyle(type);
    put(type, style);
    return style;
  }

  function remove(type: StyleSlotKey): void {
    const index = slotIndex(current(), type);
    if (index !== -1) array.remove(index);
  }

  return { get, put, add, remove, occupied: computed(() => occupiedSlots(current())) };
}
