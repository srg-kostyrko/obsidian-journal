<script setup lang="ts">
import type { BlockInstanceId } from "../../../config";
import type { MarkdownTemplateConfig } from "../markdown-template-block";

defineProps<{ instanceId: BlockInstanceId; config: MarkdownTemplateConfig }>();
</script>

<template>
  <div class="journal-view-markdown-template" />
</template>
