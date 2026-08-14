<script setup lang="ts">
import { onMounted, ref, watch } from "vue";

import { renderIcon } from "@/infrastructure/host";

const props = defineProps<{
  name: string;
  tooltip?: string;
}>();

const element = ref<HTMLSpanElement>();

onMounted(() => {
  watch(
    () => props.name,
    (name) => placeIcon(name),
    { immediate: true },
  );
});

function placeIcon(name: string): void {
  const host = element.value;
  if (!host) return;
  host.replaceChildren();
  if (!name) return;
  const icon = renderIcon(name);
  if (icon) host.append(icon);
}
</script>

<template>
  <span ref="element" :aria-label="tooltip"></span>
</template>

<style scoped>
span {
  display: inline-flex;
  align-items: center;
}
</style>
