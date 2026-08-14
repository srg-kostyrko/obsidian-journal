<script setup lang="ts">
defineProps<{
  disabled?: boolean;
}>();

const model = defineModel<string>();
</script>

<template>
  <input v-model="model" type="color" :disabled="disabled" spellcheck="false" />
</template>
