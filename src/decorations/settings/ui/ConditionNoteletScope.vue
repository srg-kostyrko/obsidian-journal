<script setup lang="ts">
import { useField } from "vee-validate";
import { computed } from "vue";

import type { NoteletScope } from "@/decorations/config";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { JournalsRepository } from "@/journals";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiToggleGroup from "@/ui/UiToggleGroup.vue";

const props = defineProps<{ name: string; journalName?: string }>();

const { value: quantifier } = useField<NoteletScope["quantifier"]>(`${props.name}.quantifier`);
const { value: source } = useField<NoteletScope["source"]>(`${props.name}.source`);
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
  <div class="condition-notelet-scope">
    <UiDropdown v-model="quantifier" :aria-label="m.decoration_condition_scope_quantifier_label()">
      <option v-for="q of ['any', 'all', 'none'] as const" :key="q" :value="q">
        {{ m.decoration_condition_tasks_quantifier_option({ quantifier: q }) }}
      </option>
    </UiDropdown>
    <UiDropdown v-model="source" :aria-label="m.decoration_condition_scope_source_label()">
      <option value="note">{{ m.view_block_tasks_source_note() }}</option>
      <option value="notelets">{{ m.view_block_tasks_source_notelets() }}</option>
      <option value="both">{{ m.view_block_tasks_source_both() }}</option>
    </UiDropdown>
    <template v-if="source !== 'note'">
      <UiToggleGroup
        v-if="typeOptions.length > 0"
        :model-value="typeIds"
        :options="typeOptions"
        :aria-label="m.decoration_condition_has_notelet_label()"
        @update:model-value="typeIds = $event"
      />
      <span v-else>{{ m.decoration_condition_has_notelet_empty() }}</span>
    </template>
  </div>
</template>

<style scoped>
.condition-notelet-scope {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--size-2-2);
}
</style>
