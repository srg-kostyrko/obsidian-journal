<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { JournalsViewModel } from "@/journals";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggleGroup from "@/ui/UiToggleGroup.vue";

import { windowKinds } from "../../custom-intervals/window-resolution";

import type { NoteletsBlockConfig, NoteletsBlockConfigChange } from "../notelets-block";

const props = defineProps<{ config: NoteletsBlockConfig; onChange: NoteletsBlockConfigChange }>();

const journals = useService(JournalsViewModel);

const update = (patch: Partial<NoteletsBlockConfig>): void => props.onChange({ ...props.config, ...patch });

const typeOptions = computed(() =>
  journals.journals.value.flatMap((journal) =>
    Object.entries(journal.notelets).map(([id, type]) => ({
      value: id,
      label: m.journal_notelet_list_type_qualified({ journal: journal.name, type: type.name }),
    })),
  ),
);
</script>

<template>
  <UiSettingRow :name="m.view_block_config_window_label()">
    <UiDropdown
      :model-value="config.window"
      @update:model-value="
        (value: string | undefined) => value && update({ window: value as NoteletsBlockConfig['window'] })
      "
    >
      <option v-for="kind of windowKinds" :key="kind" :value="kind">
        {{ m.view_block_config_window_current({ period: kind }) }}
      </option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.view_block_notelets_journals_label()">
    <template #description>{{ m.view_block_notelets_journals_description() }}</template>
    <UiToggleGroup
      :model-value="config.journals ?? []"
      :options="journals.journalOptions.value"
      @update:model-value="(value: string[]) => update({ journals: value.length > 0 ? value : undefined })"
    />
  </UiSettingRow>
  <UiSettingRow :name="m.view_block_notelets_types_label()">
    <template #description>{{ m.view_block_notelets_types_description() }}</template>
    <UiToggleGroup
      v-if="typeOptions.length > 0"
      :model-value="config.types ?? []"
      :options="typeOptions"
      @update:model-value="(value: string[]) => update({ types: value.length > 0 ? value : undefined })"
    />
    <span v-else>{{ m.view_block_notelets_types_empty() }}</span>
  </UiSettingRow>
</template>
