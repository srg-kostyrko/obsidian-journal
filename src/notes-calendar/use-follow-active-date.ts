import { computed, shallowRef, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from "vue";

import type { AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";

import { ActiveEntryViewModel } from "./active-entry";

export interface FollowActiveDateOptions {
  readonly refDate: MaybeRefOrGetter<AnchorString>;
  readonly enabled: () => boolean;
  readonly inScope: (journalName: string) => boolean;
  readonly isVisible: (anchor: AnchorString, focus: AnchorString) => boolean;
}

export function useFollowActiveDate(options: FollowActiveDateOptions): ComputedRef<AnchorString> {
  const activeEntry = useService(ActiveEntryViewModel);
  const localFocus = shallowRef<AnchorString | null>(null);

  // The focus before any pending change — used both to compute the rendered window
  // and to answer the visibility check at the moment the active note changes.
  const currentFocus = (): AnchorString => (options.enabled() ? localFocus.value : null) ?? toValue(options.refDate);

  watch(
    () => toValue(options.refDate),
    () => {
      localFocus.value = null;
    },
  );

  watch(
    activeEntry.active,
    (active) => {
      if (!options.enabled()) return;
      if (active === null || !options.inScope(active.journalName)) {
        localFocus.value = null;
        return;
      }
      if (options.isVisible(active.anchor, currentFocus())) return;
      localFocus.value = active.anchor;
    },
    { immediate: true },
  );

  return computed(currentFocus);
}
