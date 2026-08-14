<script setup lang="ts">
const props = defineProps<{
  disabled?: boolean;
  tooltip?: string;
}>();

const model = defineModel<boolean>();

function toggle() {
  if (props.disabled) return;
  model.value = !model.value;
}
</script>

<template>
  <!-- The container carries the click, so it has to carry the semantics too. The inner input is
       Obsidian's styling hook and is never bound: left in the a11y tree it reports a permanent
       unchecked state under no name, whatever the model says. -->
  <div
    class="checkbox-container"
    :class="{ 'is-enabled': model, 'is-disabled': disabled }"
    role="checkbox"
    :aria-checked="model ?? false"
    :aria-label="tooltip"
    :aria-disabled="disabled"
    :tabindex="disabled ? -1 : 0"
    @click="toggle"
    @keydown.space.prevent="toggle"
  >
    <input type="checkbox" tabindex="-1" aria-hidden="true" :checked="model" />
  </div>
</template>
