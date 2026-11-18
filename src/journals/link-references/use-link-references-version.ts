import { onMounted, onUnmounted, shallowRef, type ShallowRef } from "vue";

import { useService } from "@/infrastructure/di";

import { LinkReferenceIndex } from "./link-reference-index";

// LinkReferenceIndex is event-based, not Vue-reactive: a computed reading `count()` must also read
// this ref, or it caches its first answer — often taken before the index has built — forever.
export function useLinkReferencesVersion(): Readonly<ShallowRef<number>> {
  const index = useService(LinkReferenceIndex);
  const version = shallowRef(0);
  onMounted(() => {
    const off = index.events.on("changed", () => {
      version.value++;
    });
    onUnmounted(off);
  });
  return version;
}
