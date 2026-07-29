import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";

import type { AnchorString } from "@/calendar";

import { useWindowAnchor } from "./use-window-anchor";

import type { RefDateOrigin } from "../../view-context";

const A = "2026-05-15" as AnchorString;
const B = "2026-09-10" as AnchorString;

describe("useWindowAnchor", () => {
  it("re-centers on a navigated date that the window already contained", async () => {
    const refDate = ref(A);
    const origin = ref<RefDateOrigin>("navigate");
    const anchor = useWindowAnchor({ refDate, origin, contains: () => true });

    refDate.value = B;
    await nextTick();

    expect(anchor.value).toBe(B);
  });

  it("holds the window on a followed date that is still inside it", async () => {
    const refDate = ref(A);
    const origin = ref<RefDateOrigin>("follow");
    const anchor = useWindowAnchor({ refDate, origin, contains: () => true });

    refDate.value = B;
    await nextTick();

    expect(anchor.value).toBe(A);
  });

  it("moves the window to a followed date that falls outside it", async () => {
    const refDate = ref(A);
    const origin = ref<RefDateOrigin>("follow");
    const anchor = useWindowAnchor({ refDate, origin, contains: () => false });

    refDate.value = B;
    await nextTick();

    expect(anchor.value).toBe(B);
  });
});
