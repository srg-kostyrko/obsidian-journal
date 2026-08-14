<script setup lang="ts">
import { computed } from "vue";

import { useService } from "@/infrastructure/di";
import { defineInputSuggest, MetadataTypeService, renderIcon, type VaultProperty } from "@/infrastructure/host";
import { propertyTypeIcon } from "@/ui/icons";
import UiIcon from "@/ui/UiIcon.vue";
import UiInputSuggestInput from "@/ui/UiInputSuggestInput.vue";

const model = defineModel<string>();
defineProps<{ placeholder?: string; disabled?: boolean; ariaLabel?: string }>();

const metadataTypes = useService(MetadataTypeService);

const currentIcon = computed(() => (model.value ? propertyTypeIcon(metadataTypes.getPropertyType(model.value)) : ""));

const definition = computed(() =>
  defineInputSuggest<VaultProperty>({
    fetch: (query) => {
      const q = query.toLowerCase();
      return metadataTypes
        .listProperties()
        .filter((property) => property.name.toLowerCase().includes(q))
        .toSorted((a, b) => a.name.localeCompare(b.name));
    },
    render: (property, element) => {
      element.classList.add("journal-suggestion-property");
      const svg = renderIcon(propertyTypeIcon(property.type));
      if (svg) element.append(svg);
      element.createSpan({ text: property.name });
    },
    toValue: (property) => property.name,
  }),
);
</script>

<template>
  <span class="ui-property-suggest">
    <UiIcon v-if="currentIcon" :name="currentIcon" />
    <UiInputSuggestInput
      :model-value="model ?? ''"
      :definition="definition"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-label="ariaLabel"
      @update:model-value="model = $event"
    />
  </span>
</template>

<style scoped>
.ui-property-suggest {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
}

/* Suggestion rows render in Obsidian's popup, outside this component's scope. */
:global(.journal-suggestion-property) {
  display: flex;
  align-items: center;
  gap: var(--size-2-3);
}
</style>
