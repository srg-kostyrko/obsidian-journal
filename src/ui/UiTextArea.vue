<script setup lang="ts">
defineProps<{
  rows?: number;
  disabled?: boolean;
}>();

const model = defineModel<string>({ default: "" });
</script>

<template>
  <textarea v-model="model" class="ui-text-area" :rows="rows ?? 4" :disabled="disabled" />
</template>

<style scoped>
.ui-text-area {
  width: 100%;
  resize: vertical;
}
</style>
