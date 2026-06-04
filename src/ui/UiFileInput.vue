<script setup lang="ts">
import { computed } from "vue";

import { useService } from "@/infrastructure/di";
import { defineInputSuggest, NotesService } from "@/infrastructure/host";
import UiInputSuggestInput from "@/ui/UiInputSuggestInput.vue";

defineProps<{ modelValue: string; placeholder?: string; disabled?: boolean }>();
defineEmits<{ "update:modelValue": [value: string] }>();

const notes = useService(NotesService);

const definition = computed(() =>
  defineInputSuggest<string>({
    fetch: (query) => {
      const q = query.toLowerCase();
      return notes
        .allMarkdownNotes()
        .filter((path) => path.toLowerCase().includes(q))
        .toSorted();
    },
    render: (path, element) => {
      element.setText(path);
    },
    toValue: (path) => path,
  }),
);
</script>

<template>
  <UiInputSuggestInput
    :model-value="modelValue"
    :definition="definition"
    :placeholder="placeholder"
    :disabled="disabled"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>
