<script setup lang="ts">
import { getIcon } from "obsidian";
import { onMounted, ref, watch } from "vue";

const props = defineProps<{
  name: string;
  tooltip?: string;
}>();

const el = ref<HTMLDivElement>();

onMounted(() => {
  watch(
    () => props.name,
    (name) => placeIcon(name),
    { immediate: true },
  );
});

function placeIcon(name?: string): void {
  if (!name) return;
  const icon = getIcon(name);
  if (icon && el.value) {
    el.value.empty();
    el.value.appendChild(icon);
  }
}
</script>

<template>
  <div ref="el" :aria-label="tooltip"></div>
</template>
