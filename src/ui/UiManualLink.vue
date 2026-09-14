<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import { manualUrl } from "@/ui/manual";
import type { ManualPath } from "@/ui/manual";
import UiIcon from "@/ui/UiIcon.vue";

const { path } = defineProps<{ path: ManualPath }>();

const url = computed(() => manualUrl(path));

function open(): void {
  window.open(url.value, "_blank");
}
</script>

<template>
  <a class="manual-link clickable-icon" :href="url" :aria-label="m.ui_manual_link()" @click.stop.prevent="open">
    <UiIcon :name="icons.action.help" />
  </a>
</template>

<style scoped>
.manual-link {
  --icon-size: var(--icon-xs);
  display: inline-flex;
  align-items: center;
  margin-inline-start: var(--size-4-1);
  padding: var(--size-2-1);
  color: var(--text-faint);
}
.manual-link:hover {
  color: var(--text-muted);
}
</style>
