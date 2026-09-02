<script setup lang="ts">
import { useField } from "vee-validate";
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { JournalsRepository } from "@/journals";
import UiToggleGroup from "@/ui/UiToggleGroup.vue";

const props = defineProps<{ name: string; journalName?: string }>();
const { value: typeIds } = useField<string[]>(`${props.name}.typeIds`);

const journals = useService(JournalsRepository);

const typeOptions = computed(() => {
  if (props.journalName === undefined) return [];
  const config = journals.get(props.journalName).getOrUndefined();
  if (config === undefined) return [];
  return Object.entries(config.notelets).map(([id, type]) => ({ value: id, label: type.name }));
});
</script>

<template>
  <UiToggleGroup
    v-if="typeOptions.length > 0"
    :model-value="typeIds"
    :options="typeOptions"
    :aria-label="m.decoration_condition_has_notelet_label()"
    @update:model-value="typeIds = $event"
  />
  <span v-else>{{ m.decoration_condition_has_notelet_empty() }}</span>
</template>
