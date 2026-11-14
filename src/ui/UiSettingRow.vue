<script setup lang="ts">
import UiManualLink from "./UiManualLink.vue";

import type { ManualPath } from "./manual";

defineProps<{
  name?: string;
  heading?: boolean;
  controlsOnly?: boolean;
  noControls?: boolean;
  stacked?: boolean;
  help?: ManualPath;
}>();
</script>

<template>
  <div class="setting-item" :class="{ 'setting-item-heading': heading, 'setting-item--stacked': stacked }">
    <div v-if="!controlsOnly" class="setting-item-info">
      <div class="setting-item-name" :class="{ 'setting-item-name--with-help': help }">
        <slot name="name">{{ name ?? "" }}</slot>
        <UiManualLink v-if="help" :path="help" />
      </div>
      <div class="setting-item-description">
        <slot name="description" />
      </div>
    </div>
    <div v-if="!noControls" class="setting-item-control">
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* From 1.13 Obsidian insets headings to line up with the padded rows of a settings group, but
   strips that padding from a modal's plain rows, which leaves a modal's heading indented. */
.modal:not(.mod-settings) .setting-item-heading:where(:not(.setting-group *)) {
  padding-inline: 0;
}
/* A name slot may hold a block (an icon row), which would push the help link onto a line of its
   own; one centered line keeps it beside the title, as the collapsible blocks' triggers do. */
.setting-item-name--with-help {
  display: flex;
  align-items: center;
  gap: var(--size-2-1);
}
.setting-item--stacked {
  flex-direction: column;
  align-items: stretch;
}
.setting-item--stacked .setting-item-info {
  margin-inline-end: 0;
}
/* Stays nowrap like the unstacked row: controls that outgrow the width shrink to share one
   line rather than each claiming its own. A control needing several lines lays them out itself. */
.setting-item--stacked .setting-item-control {
  justify-content: flex-start;
  min-width: 0;
}
</style>
