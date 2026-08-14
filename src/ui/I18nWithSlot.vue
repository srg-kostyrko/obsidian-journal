<script setup lang="ts">
import { computed } from "vue";

import type { I18nMessageFn } from "./i18n-with-slot";

const props = defineProps<{ message: I18nMessageFn }>();

const SENTINEL = "__i18n_slot__";

const parts = computed(() => {
  const rendered = props.message({ slot: SENTINEL });
  const index = rendered.indexOf(SENTINEL);
  if (index === -1) return { before: rendered, after: "" };
  return { before: rendered.slice(0, index), after: rendered.slice(index + SENTINEL.length) };
});
</script>

<template>
  <span>{{ parts.before }}<slot />{{ parts.after }}</span>
</template>
