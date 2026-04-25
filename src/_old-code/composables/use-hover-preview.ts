import { useEventListener, useKeyModifier } from "@vueuse/core";
import { shallowRef, watchEffect, type MaybeRefOrGetter } from "vue";
import { Platform } from "obsidian";

export const useHoverPreview = (
  element: MaybeRefOrGetter<EventTarget | null | undefined>,
  callback: (event: MouseEvent) => void,
) => {
  const hoverEvent = shallowRef<MouseEvent>();
  const metaState = useKeyModifier(Platform.isMacOS ? "Meta" : "Control");

  useEventListener<MouseEvent>(element, "mouseenter", (event) => (hoverEvent.value = event), { passive: true });

  watchEffect(() => {
    if (hoverEvent.value && metaState.value) {
      callback(hoverEvent.value);
      hoverEvent.value = undefined;
    }
  });
};
