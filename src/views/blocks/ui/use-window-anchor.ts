import { computed, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from "vue";

import type { AnchorString } from "@/calendar";

import type { RefDateOrigin } from "../../view-context";

export interface WindowAnchorOptions {
  readonly refDate: MaybeRefOrGetter<AnchorString>;
  readonly origin: MaybeRefOrGetter<RefDateOrigin>;
  readonly contains: (date: AnchorString, windowAnchor: AnchorString) => boolean;
}

export function useWindowAnchor(options: WindowAnchorOptions): ComputedRef<AnchorString> {
  const anchor = shallowRef(toValue(options.refDate));

  watch(
    () => toValue(options.refDate),
    (next) => {
      // A note opening and a date picked out of a grid both move the selection without asking
      // the window to scroll away from what already shows it; navigation is an explicit request
      // to move, so it always re-lays-out the window.
      if (toValue(options.origin) !== "navigate" && options.contains(next, anchor.value)) return;
      anchor.value = next;
    },
  );

  // A remembered anchor outlives the range that justified holding it: blocks are updated in
  // place when their window config shrinks, which can leave the view's date outside.
  return computed(() => {
    const date = toValue(options.refDate);
    return options.contains(date, anchor.value) ? anchor.value : date;
  });
}
