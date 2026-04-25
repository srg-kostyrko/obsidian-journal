<script setup lang="ts">
defineProps<{ name?: string; description?: string; heading?: boolean; controlsOnly?: boolean; noControls?: boolean }>();
</script>

<template>
  <div class="setting-item" :class="{ 'setting-item--heading': heading }">
    <div v-if="!controlsOnly" class="setting-item-info">
      <div class="setting-item-name">
        <slot name="name">
          {{ name ?? "" }}
        </slot>
      </div>
      <div class="setting-item-description">
        <slot name="description">
          {{ description ?? "" }}
        </slot>
      </div>
    </div>
    <div v-if="!noControls" class="setting-item-control">
      <slot />
    </div>
  </div>
</template>
