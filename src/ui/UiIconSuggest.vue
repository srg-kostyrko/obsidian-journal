<script setup lang="ts">
import { getIconIds } from "obsidian";
import { computed } from "vue";

import { defineInputSuggest, renderIcon } from "@/infrastructure/host";
import UiIcon from "@/ui/UiIcon.vue";
import UiInputSuggestInput from "@/ui/UiInputSuggestInput.vue";

const model = defineModel<string>();
defineProps<{ placeholder?: string; disabled?: boolean }>();

const allIcons = getIconIds();

const definition = computed(() =>
  defineInputSuggest<string>({
    fetch: (query) => {
      const q = query.toLowerCase();
      return allIcons.filter((icon) => icon.toLowerCase().includes(q)).toSorted();
    },
    render: (icon, element) => {
      element.classList.add("journal-suggestion-icon");
      const svg = renderIcon(icon);
      if (svg) element.append(svg);
      element.createSpan({ text: icon });
    },
    toValue: (icon) => icon,
  }),
);
</script>

<template>
  <span class="ui-icon-suggest">
    <UiIcon v-if="model" :name="model" />
    <UiInputSuggestInput
      :model-value="model ?? ''"
      :definition="definition"
      :placeholder="placeholder"
      :disabled="disabled"
      @update:model-value="model = $event"
    />
  </span>
</template>

<style scoped>
.ui-icon-suggest {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
}

/* Suggestion rows render in Obsidian's popup, outside this component's scope. */
:global(.journal-suggestion-icon) {
  display: flex;
  align-items: center;
  gap: var(--size-2-3);
}
</style>
