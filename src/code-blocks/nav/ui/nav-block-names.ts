import type { ComputedRef, InjectionKey } from "vue";

// The whole-block decoration's names, provided by NavBlock for the segments inside it: the block
// paints behind every segment, so each segment's tooltip has to carry them.
export const NavBlockNamesKey: InjectionKey<ComputedRef<readonly string[]>> = Symbol("nav:block-names");
