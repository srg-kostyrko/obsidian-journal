<script setup lang="ts">
defineProps<{ label: string; occupied: boolean }>();
defineEmits<{ choose: [] }>();
</script>

<template>
  <button type="button" class="whole-region" :aria-label="label" :aria-pressed="occupied" @click="$emit('choose')" />
</template>

<style scoped>
.whole-region {
  position: absolute;
  inset: 0;
  background-color: transparent;
  box-shadow: none;
  border: 1px dashed var(--background-modifier-border);
}
.whole-region:hover {
  background-color: var(--background-modifier-hover);
}
.whole-region[aria-pressed="true"] {
  border: 2px solid var(--interactive-accent);
}
</style>
