<script setup lang="ts">
defineProps<{
  disabled?: boolean;
}>();

// `<input type="color">` coerces an empty value to #000000, so that is the honest default —
// the same fallback UiColorSettingsPicker uses when a custom color is not set yet.
const model = defineModel<string>({ default: "#000000" });
</script>

<template>
  <input v-model="model" type="color" :disabled="disabled" spellcheck="false" />
</template>
