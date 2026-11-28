import { setTooltip } from "obsidian";

import type { Directive } from "vue";

// Obsidian's own tooltip API. It is `setAttribute("aria-label", …)` underneath (checked at 1.8.7 and
// 1.15.1), so it replaces the element's accessible name, and it re-runs on every re-render — never put
// it on an element that also binds `aria-label`, or the two overwrite each other.
export const vTooltip: Directive<HTMLElement, string> = {
  mounted: (el, binding) => setTooltip(el, binding.value),
  updated: (el, binding) => setTooltip(el, binding.value),
};
