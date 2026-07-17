import { setTooltip } from "obsidian";

import type { Directive } from "vue";

// Obsidian's own tooltip API, for a control whose accessible name must stay its visible text.
// Binding a tooltip to `aria-label` (what UiButton/UiIconButton do) would replace that name —
// fine for an icon or a glyph, wrong when the text is the information the control carries.
export const vTooltip: Directive<HTMLElement, string> = {
  mounted: (el, binding) => setTooltip(el, binding.value),
  updated: (el, binding) => setTooltip(el, binding.value),
};
