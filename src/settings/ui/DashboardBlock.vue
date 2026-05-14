<script setup lang="ts">
import type { Component } from "vue";

defineProps<{ component: Component }>();
</script>

<template>
  <section class="journal-settings-block">
    <component :is="component" />
  </section>
</template>
