<script setup lang="ts">
import type { BlockInstanceId } from "../../../config";
import type { NoteletsBlockConfig } from "../notelets-block";

defineProps<{ instanceId: BlockInstanceId; config: NoteletsBlockConfig }>();
</script>

<template>
  <section class="journal-view-notelets" />
</template>
