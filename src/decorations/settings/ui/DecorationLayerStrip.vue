<script setup lang="ts">
import { match } from "ts-pattern";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiIcon from "@/ui/UiIcon.vue";

import { STYLE_SLOT_KEYS, type StyleSlotKey } from "../../style-slots";

import type { ComponentPublicInstance } from "vue";

defineProps<{ occupied: ReadonlySet<StyleSlotKey>; panelId: string }>();
const active = defineModel<StyleSlotKey>({ required: true });

// A tablist takes one tab stop and moves between tabs with the arrows, so the chips need to
// be focusable individually from script (roving tabindex) rather than through the DOM.
const tabs: HTMLButtonElement[] = [];

function registerTab(element: Element | ComponentPublicInstance | null, index: number): void {
  if (element instanceof HTMLButtonElement) tabs[index] = element;
}

// Automatic activation: arrowing to a tab selects it. The panel is one inspector that
// re-renders from local state, so there is nothing costly enough to wait for a second gesture.
function onKeydown(event: KeyboardEvent, index: number): void {
  const last = STYLE_SLOT_KEYS.length - 1;
  const target = match(event.key)
    .with("ArrowRight", () => (index === last ? 0 : index + 1))
    .with("ArrowLeft", () => (index === 0 ? last : index - 1))
    .with("Home", () => 0)
    .with("End", () => last)
    .otherwise(() => null);
  if (target === null) return;
  const key = STYLE_SLOT_KEYS.at(target);
  if (key === undefined) return;
  event.preventDefault();
  active.value = key;
  tabs.at(target)?.focus();
}
</script>

<template>
  <div class="layer-strip" role="tablist" :aria-label="m.decoration_canvas_layers_label()">
    <button
      v-for="(key, index) of STYLE_SLOT_KEYS"
      :key="key"
      :ref="(element) => registerTab(element, index)"
      type="button"
      role="tab"
      class="layer-chip"
      :aria-selected="active === key"
      :aria-controls="panelId"
      :tabindex="active === key ? 0 : -1"
      :aria-label="m.decoration_layer_chip_label({ type: key, state: occupied.has(key) ? 'occupied' : 'empty' })"
      @click="active = key"
      @keydown="onKeydown($event, index)"
    >
      {{ m.decoration_style_type_label({ type: key }) }}
      <UiIcon v-if="occupied.has(key)" :name="icons.action.check" class="layer-badge" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.layer-strip {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-2-3);
  border-bottom: 1px solid var(--background-modifier-border);
}
/* Obsidian's button chrome is what forced the six layers onto two rows, and its filled active
   state put the loudest thing on the pane above a canvas whose own defaults are accent-colored.
   A tab underlines instead: the accent left here is the active marker and the occupancy dots. */
.layer-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-1);
  height: auto;
  padding: var(--size-2-2);
  border-radius: 0;
  border-bottom: 2px solid transparent;
  /* Overlaps the strip's rule so the active tab's underline replaces it rather than stacking. */
  margin-bottom: -1px;
  background-color: transparent;
  box-shadow: none;
  color: var(--text-muted);
}
.layer-chip:hover {
  background-color: transparent;
  box-shadow: none;
  color: var(--text-normal);
}
.layer-chip[aria-selected="true"] {
  border-bottom-color: var(--interactive-accent);
  color: var(--text-normal);
}
.layer-badge {
  --icon-size: var(--icon-xs);
  --icon-stroke: var(--icon-xs-stroke-width);

  color: var(--text-accent);
}
</style>
