<script setup lang="ts">
defineProps<{
  placeholder?: string;
  disabled?: boolean;
}>();

const model = defineModel<string>({ default: "" });
</script>

<template>
  <input v-model="model" type="text" :placeholder="placeholder" :disabled="disabled" spellcheck="false" />
</template>
