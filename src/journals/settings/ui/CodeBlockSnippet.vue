<script setup lang="ts">
import { computed } from "vue";

import UiCopyableCode from "@/ui/UiCopyableCode.vue";

const props = defineProps<{ name: string; body?: string }>();

const text = computed(() =>
  props.body ? `\`\`\`${props.name}\n${props.body}\n\`\`\`` : `\`\`\`${props.name}\n\`\`\``,
);
</script>

<template>
  <UiCopyableCode :text="text" />
</template>
