<script setup lang="ts">
defineProps<{ name?: string; descripton?: string; heading?: boolean; controlsOnly?: boolean }>();
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
          {{ descripton ?? "" }}
        </slot>
      </div>
    </div>
    <div class="setting-item-control">
      <slot />
    </div>
  </div>
</template>
