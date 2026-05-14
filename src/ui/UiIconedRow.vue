<script setup lang="ts">
import UiIcon from "./UiIcon.vue";

defineProps<{ icon: string }>();
</script>

<template>
  <div class="iconed-row">
    <UiIcon :name="icon" />
    <div>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.iconed-row {
  display: flex;
  align-items: center;
  gap: var(--size-2-2);
}
</style>
