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
  <div
    class="checkbox-container"
    :class="{ 'is-enabled': model, 'is-disabled': disabled }"
    :aria-label="tooltip"
    @click="toggle"
  >
    <input type="checkbox" tabindex="0" />
  </div>
</template>
