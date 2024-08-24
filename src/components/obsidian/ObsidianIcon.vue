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
  el.value?.empty();
  if (!name) return;
  const icon = getIcon(name);
  if (icon && el.value) {
    el.value.appendChild(icon);
  }
}
</script>

<template>
  <span ref="el" :aria-label="tooltip"></span>
</template>
