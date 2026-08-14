<script setup lang="ts" generic="T">
const model = defineModel<T[]>({ required: true });

defineProps<{
  options: { value: T; label: string; tooltip?: string; class?: string }[];
  disabled?: boolean;
}>();

function toggle(value: T): void {
  model.value = model.value.includes(value)
    ? model.value.filter((current) => current !== value)
    : [...model.value, value];
}
</script>

<template>
  <div class="ui-toggle-group" role="group">
    <button
      v-for="option in options"
      :key="String(option.value)"
      type="button"
      class="ui-toggle-group__option"
      :class="[option.class, { 'is-active': model.includes(option.value) }]"
      :aria-pressed="model.includes(option.value)"
      :aria-label="option.tooltip"
      :disabled="disabled"
      @click="toggle(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.ui-toggle-group {
  display: flex;
  flex-wrap: wrap;
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s);
  overflow: hidden;
}
.ui-toggle-group__option {
  flex: 1 1 auto;
  padding: var(--size-4-1) var(--size-4-2);
  border: none;
  border-left: 1px solid var(--background-modifier-border);
  border-radius: 0;
  background-color: var(--background-primary);
  color: var(--text-muted);
  box-shadow: none;
  cursor: pointer;
}
.ui-toggle-group__option:first-child {
  border-left: none;
}
.ui-toggle-group__option.is-active {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}
.ui-toggle-group__option:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.ui-toggle-group__option:focus-visible {
  box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
}
</style>
