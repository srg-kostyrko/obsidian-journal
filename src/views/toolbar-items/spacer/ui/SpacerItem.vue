<script setup lang="ts">
import type { BlockInstanceId } from "../../../config";

defineProps<{ instanceId: BlockInstanceId; config: Record<string, never> }>();
</script>

<template>
  <div class="jv-toolbar-spacer" />
</template>

<style scoped>
.jv-toolbar-spacer {
  flex: 1 1 0;
  min-width: 0;
}
</style>
