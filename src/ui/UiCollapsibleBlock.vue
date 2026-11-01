<script setup lang="ts">
import { computed, useId } from "vue";

import UiIcon from "./UiIcon.vue";
import UiManualLink from "./UiManualLink.vue";

import type { ManualPath } from "./manual";

defineProps<{ help?: ManualPath }>();

const expanded = defineModel<boolean>("expanded");

const icon = computed(() => (expanded.value ? "chevron-down" : "chevron-right"));
const contentId = useId();

function toggle() {
  expanded.value = !expanded.value;
}
</script>

<template>
  <div class="collapsible-root" :data-open="expanded || null">
    <!-- The whole row toggles on click; the button inside it is what Tab reaches, and its native
         Enter/Space click bubbles up to the same handler. The help link and controls sit outside
         it, since interactive content cannot nest inside a button. -->
    <div class="collapsible-trigger" @click="toggle">
      <button
        type="button"
        class="collapsible-trigger-button"
        :aria-expanded="expanded ?? false"
        :aria-controls="contentId"
      >
        <UiIcon :name="icon" />
        <span class="collapsible-trigger-text">
          <slot name="trigger" />
        </span>
      </button>
      <UiManualLink v-if="help" :path="help" />
      <span class="collapsible-trigger-controls" @click.stop>
        <slot name="controls" />
      </span>
    </div>
    <div v-if="expanded" :id="contentId" class="collapsible-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.collapsible-root {
  padding-bottom: var(--size-2-2);
  margin-top: var(--size-2-2);
  margin-bottom: var(--size-4-2);
}
.collapsible-root[data-open] {
  border-bottom: 1px solid var(--color-accent);
}
.collapsible-trigger {
  cursor: pointer;
  display: flex;
  align-items: center;
  border-top: 1px solid var(--color-accent);
  border-bottom: 1px solid var(--color-accent);
  gap: 4px;
  padding-top: var(--size-2-2);
  padding-bottom: var(--size-2-2);
  min-height: 38px;
}
/* Obsidian gives every button a filled, shadowed, fixed-height look; this one is the heading
   itself, so it keeps only the focus ring. */
.collapsible-trigger-button {
  display: flex;
  align-items: center;
  gap: 4px;
  /* Without this the heading refuses to shrink below its content and the controls give up
     their width instead, which is what stacked them. */
  min-width: 0;
  height: auto;
  padding: 0;
  border: none;
  background: none;
  box-shadow: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.collapsible-trigger-button:focus-visible {
  box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
}
/* The block owns its heading weight so every trigger reads the same; call sites supply only
   the icon and the words. */
.collapsible-trigger-text {
  display: flex;
  align-items: center;
  font-weight: var(--font-semibold);
  min-width: 0;
}
/* An inline box wraps its buttons like words, so a heading long enough to squeeze this flex
   item stacked the controls vertically instead of keeping them on one line. */
.collapsible-trigger-controls {
  display: flex;
  margin-inline-start: auto;
  align-items: center;
  gap: var(--size-2-2);
  flex-shrink: 0;
}
.collapsible-content {
  padding-top: var(--size-4-2);
}
</style>
