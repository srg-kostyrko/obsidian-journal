<script setup lang="ts" generic="T">
import { useId } from "vue";

const model = defineModel<T>({ required: true });

defineProps<{
  options: { value: T; label: string }[];
  disabled?: boolean;
}>();

// Two instances on one page must not join the same native radio group.
const groupName = useId();
</script>

<template>
  <div class="ui-segmented-control" role="radiogroup">
    <label v-for="option in options" :key="String(option.value)" class="ui-segmented-control__option">
      <input
        v-model="model"
        type="radio"
        class="ui-segmented-control__input"
        :name="groupName"
        :value="option.value"
        :disabled="disabled"
      />
      <span class="ui-segmented-control__label">{{ option.label }}</span>
    </label>
  </div>
</template>

<style scoped>
.ui-segmented-control {
  display: flex;
  flex-wrap: wrap;
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s);
  overflow: hidden;
}
.ui-segmented-control__option {
  flex: 1 1 auto;
  display: flex;
}
.ui-segmented-control__input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.ui-segmented-control__label {
  flex: 1 1 auto;
  padding: var(--size-4-1) var(--size-4-2);
  border-left: 1px solid var(--background-modifier-border);
  background-color: var(--background-primary);
  color: var(--text-muted);
  text-align: center;
  cursor: pointer;
}
.ui-segmented-control__option:first-child .ui-segmented-control__label {
  border-left: none;
}
.ui-segmented-control__input:checked + .ui-segmented-control__label {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}
.ui-segmented-control__input:disabled + .ui-segmented-control__label {
  cursor: not-allowed;
  opacity: 0.5;
}
.ui-segmented-control__input:focus-visible + .ui-segmented-control__label {
  box-shadow: inset 0 0 0 2px var(--background-modifier-border-focus);
}
</style>
