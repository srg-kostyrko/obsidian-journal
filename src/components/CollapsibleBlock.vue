<script setup lang="ts">
import { computed } from "vue";
import ObsidianIcon from "./obsidian/ObsidianIcon.vue";

const expanded = defineModel<boolean>("expanded");
const props = defineProps<{ defaultExpanded?: boolean }>();
if (props.defaultExpanded) {
  expanded.value = true;
}

const icon = computed(() => (expanded.value ? "chevron-down" : "chevron-right"));

function toggle() {
  expanded.value = !expanded.value;
}
</script>

<template>
  <div class="collapsible-root" :data-open="expanded ? true : undefined">
    <div class="collapsible-trigger">
      <ObsidianIcon :name="icon" @click="toggle" />
      <span class="collapsible-trigger-text" @click="toggle">
        <slot name="trigger"></slot>
      </span>
      <span class="collapsible-trigger-controls">
        <slot name="controls"></slot>
      </span>
    </div>
    <template v-if="expanded">
      <slot />
    </template>
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
.collapsible-trigger-text {
  flex-grow: 1;
}
</style>
