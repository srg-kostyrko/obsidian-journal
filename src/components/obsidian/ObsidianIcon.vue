<script setup lang="ts">
import { getIcon } from "obsidian";
import { onMounted, ref, watch } from "vue";

const props = defineProps<{
  name: string;
  tooltip?: string;
}>();

const element = ref<HTMLDivElement>();

onMounted(() => {
  watch(
    () => props.name,
    (name) => placeIcon(name),
    { immediate: true },
  );
});

function placeIcon(name?: string): void {
  element.value?.empty();
  if (!name) return;
  const icon = getIcon(name);
  if (icon && element.value) {
    element.value.append(icon);
  }
}
</script>

<template>
  <span ref="element" :aria-label="tooltip"></span>
</template>
