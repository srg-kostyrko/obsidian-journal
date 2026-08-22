import { createSharedComposable, useEventListener, useTimeoutFn } from "@vueuse/core";
import { shallowRef, type ShallowRef } from "vue";

import { CalendarDate } from "../calendar-date";
import { Clock } from "../clock";

// `CalendarDate.today()` read inside a computed caches the day the component mounted, so a
// calendar left open overnight keeps marking yesterday until Obsidian restarts. Calendar surfaces
// read this ref instead. It is shared, so a month grid arms one timer rather than one per cell,
// and VueUse stops the scope when the last consumer unmounts.
export const useToday = createSharedComposable((): Readonly<ShallowRef<CalendarDate>> => {
  const today = shallowRef(CalendarDate.today());

  function refresh(): void {
    const current = CalendarDate.today();
    // Guarded so a resync that lands on the same day does not re-render every calendar cell.
    if (!current.isSame(today.value)) today.value = current;
  }

  const { start } = useTimeoutFn(
    () => {
      refresh();
      start();
    },
    () => Clock.msUntilNextLocalMidnight(),
  );

  function resync(): void {
    refresh();
    start();
  }

  // Chromium timers do not advance while the machine is suspended, so a laptop asleep across
  // midnight wakes with hours still left on the timeout — the case that reads as a marker that
  // never moves at all. Coming back to the app re-reads the wall clock and re-arms from it.
  useEventListener(window, "focus", resync);
  useEventListener(window.document, "visibilitychange", resync);

  return today;
});
