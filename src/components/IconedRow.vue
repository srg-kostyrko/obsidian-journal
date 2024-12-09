<script setup lang="ts">
import ObsidianIcon from "./obsidian/ObsidianIcon.vue";
defineProps<{ icon: string }>();
</script>

<template>
  <div class="iconed-row">
    <ObsidianIcon :name="icon" />
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
