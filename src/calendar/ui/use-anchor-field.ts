import { computed, toRaw, toValue, type MaybeRefOrGetter, type Ref, type WritableComputedRef } from "vue";

import { CalendarDate, periodOfKind, type AnchorString, type Period } from "@/calendar";

import type { Picking } from "./errors";

export function useAnchorField(options: {
  anchor: Ref<AnchorString>;
  picking: MaybeRefOrGetter<Picking>;
}): WritableComputedRef<Period | null> {
  return computed({
    get: () => {
      const a = options.anchor.value;
      if (!a) return null;
      return periodOfKind(toValue(options.picking), CalendarDate.fromAnchor(a));
    },
    set: (period) => {
      const raw = period ? toRaw(period) : null;
      const rawAnchor = raw ? toRaw(raw.anchor) : null;
      options.anchor.value = (rawAnchor ? rawAnchor.toAnchor() : "") as AnchorString;
    },
  });
}
