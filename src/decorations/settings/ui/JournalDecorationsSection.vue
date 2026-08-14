<script setup lang="ts">
import DecorationsSection from "./DecorationsSection.vue";

const { journalName } = defineProps<{ journalName: string }>();
</script>

<template>
  <DecorationsSection :owner="{ kind: 'journal', journalName }" />
</template>
