<script setup lang="ts">
import { computed } from "vue";

import UiIcon from "./UiIcon.vue";

const expanded = defineModel<boolean>("expanded");

const icon = computed(() => (expanded.value ? "chevron-down" : "chevron-right"));

function toggle() {
  expanded.value = !expanded.value;
}
</script>

<template>
  <div class="collapsible-root" :data-open="expanded || null">
    <div class="collapsible-trigger" @click="toggle">
      <UiIcon :name="icon" />
      <span class="collapsible-trigger-text">
        <slot name="trigger" />
      </span>
      <span class="collapsible-trigger-controls" @click.stop>
        <slot name="controls" />
      </span>
    </div>
    <div v-if="expanded" class="collapsible-content">
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
/* The block owns its heading weight so every trigger reads the same; call sites supply only
   the icon and the words. */
.collapsible-trigger-text {
  display: flex;
  align-items: center;
  flex-grow: 1;
  font-weight: var(--font-semibold);
  /* Without this the heading refuses to shrink below its content and the controls give up
     their width instead, which is what stacked them. */
  min-width: 0;
}
/* An inline box wraps its buttons like words, so a heading long enough to squeeze this flex
   item stacked the controls vertically instead of keeping them on one line. */
.collapsible-trigger-controls {
  display: flex;
  align-items: center;
  gap: var(--size-2-2);
  flex-shrink: 0;
}
.collapsible-content {
  padding-top: var(--size-4-2);
}
</style>
