<script setup lang="ts">
import { computed } from "vue";

import { useService } from "@/infrastructure/di";
import { defineInputSuggest, NotesService, type VaultPath } from "@/infrastructure/host";
import UiInputSuggestInput from "@/ui/UiInputSuggestInput.vue";

defineProps<{ modelValue: string; placeholder?: string; disabled?: boolean }>();
defineEmits<{ "update:modelValue": [value: string] }>();

const notes = useService(NotesService);

function isNote(path: VaultPath): boolean {
  return path.endsWith(".md");
}

const definition = computed(() =>
  defineInputSuggest<VaultPath>({
    fetch: (query) => {
      // No suggestions until the user types: an empty query must not pop the whole vault on focus.
      if (query === "") return [];
      const q = query.toLowerCase();
      return notes
        .listFiles()
        .filter((path) => path.toLowerCase().includes(q))
        .toSorted((a, b) => Number(isNote(b)) - Number(isNote(a)) || a.localeCompare(b));
    },
    render: (path, element) => {
      element.classList.add("journal-suggestion-note");
      const slash = path.lastIndexOf("/");
      element.createDiv({ text: path.slice(slash + 1).replace(/\.md$/, "") });
      if (slash !== -1) element.createDiv({ cls: "journal-suggestion-note__folder", text: path.slice(0, slash) });
    },
    toValue: (path) => notes.linkTextFor(path),
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

<style scoped>
/* Suggestion rows render in Obsidian's popup, outside this component's scope. */
:global(.journal-suggestion-note__folder) {
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
}
</style>
