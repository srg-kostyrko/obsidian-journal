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
      // A note opening moves the selection but should not scroll a grid that already shows it;
      // navigation is an explicit request to move, so it always re-lays-out the window.
      if (toValue(options.origin) === "follow" && options.contains(next, anchor.value)) return;
      anchor.value = next;
    },
  );

  return computed(() => anchor.value);
}
