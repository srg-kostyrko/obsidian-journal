<script setup lang="ts">
import DecorationsSection from "./DecorationsSection.vue";

const { shelfName } = defineProps<{ shelfName: string }>();
</script>

<template>
  <DecorationsSection :owner="{ kind: 'shelf', shelfName }" />
</template>
