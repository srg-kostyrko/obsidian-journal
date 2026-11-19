import { onMounted, onUnmounted, shallowRef, type ShallowRef } from "vue";

import { useService } from "@/infrastructure/di";

import { CreationDateIndex } from "./creation-date-index";

// CreationDateIndex is event-based, not Vue-reactive: a computed reading it must also read this
// ref, or it caches its first answer — often taken before the index has built — forever.
export function useCreationDatesVersion(): Readonly<ShallowRef<number>> {
  const index = useService(CreationDateIndex);
  const version = shallowRef(0);
  onMounted(() => {
    const off = index.events.on("changed", () => {
      version.value++;
    });
    onUnmounted(off);
  });
  return version;
}
