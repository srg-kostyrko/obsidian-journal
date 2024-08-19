<script setup lang="ts">
defineProps<{
  placeholder?: string;
  disabled?: boolean;
}>();

const model = defineModel<number>();
</script>

<template>
  <input v-model="model" type="number" :placeholder="placeholder" :disabled="disabled" spellcheck="false" />
</template>
