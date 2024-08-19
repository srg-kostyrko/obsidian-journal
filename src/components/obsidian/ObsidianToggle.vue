<script setup lang="ts">
defineProps<{
  disabled?: boolean;
  tooltip?: string;
}>();

const model = defineModel<boolean>();
</script>

<template>
  <div
    class="checkbox-container"
    :class="{ 'is-enabled': model, 'is-disabled': disabled }"
    :aria-label="tooltip"
    @click="model = !model"
  >
    <input type="checkbox" tabindex="0" />
  </div>
</template>
