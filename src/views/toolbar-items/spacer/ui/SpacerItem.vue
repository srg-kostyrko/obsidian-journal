<script setup lang="ts">
import { icons } from "@/ui/icons";
import UiIcon from "@/ui/UiIcon.vue";

import { useViewContext } from "../../../view-context";

import type { BlockInstanceId } from "../../../config";

defineProps<{ instanceId: BlockInstanceId; config: Record<string, never> }>();

const context = useViewContext();
</script>

<template>
  <div class="jv-toolbar-spacer">
    <span v-if="context.preview" class="jv-spacer-hint"><UiIcon :name="icons.block.spacer" /></span>
  </div>
</template>

<style scoped>
.jv-toolbar-spacer {
  flex: 1 1 0;
  min-width: 0;
}
.jv-spacer-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--size-4-8);
  padding: 0 var(--size-2-2);
  border: 1px dashed var(--background-modifier-border);
  border-radius: var(--radius-s);
  color: var(--text-faint);
}
</style>
