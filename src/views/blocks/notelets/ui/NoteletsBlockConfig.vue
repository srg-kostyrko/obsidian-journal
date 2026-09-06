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

// A journal with no notelet types contributes nothing to this block whatever the filters say, so
// offering it is a toggle that cannot change what is listed.
const typedJournals = computed(() =>
  journals.journals.value.filter((journal) => Object.keys(journal.notelets).length > 0),
);

const journalOptions = computed(() =>
  typedJournals.value.map((journal) => ({ value: journal.name, label: journal.name })),
);

// The two filters intersect, so a type belonging to a journal the block is not scoped to is a
// selection that can only ever list nothing. Offer the types of the picked journals — or of every
// journal that has any, which is what an empty journal filter means.
const scopedJournals = computed(() => {
  const filter = props.config.journals;
  return filter === undefined || filter.length === 0
    ? typedJournals.value
    : typedJournals.value.filter((journal) => filter.includes(journal.name));
});

const typeOptions = computed(() =>
  scopedJournals.value.flatMap((journal) =>
    Object.entries(journal.notelets).map(([id, type]) => ({
      value: id,
      label: m.journal_notelet_list_type_qualified({ journal: journal.name, type: type.name }),
    })),
  ),
);

// Narrowing the journals would otherwise leave the types they contributed selected but off-screen,
// filtering the block by something the user can no longer see or clear.
function updateJournals(names: string[]): void {
  const offered = new Set(
    (names.length > 0
      ? typedJournals.value.filter((journal) => names.includes(journal.name))
      : typedJournals.value
    ).flatMap((journal) => Object.keys(journal.notelets)),
  );
  const kept = props.config.types?.filter((id) => offered.has(id));
  update({
    journals: names.length > 0 ? names : undefined,
    types: kept !== undefined && kept.length > 0 ? kept : undefined,
  });
}
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
        {{ m.view_block_config_window_selected({ period: kind }) }}
      </option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow v-if="journalOptions.length > 0" :name="m.view_block_notelets_journals_label()">
    <template #description>{{ m.view_block_notelets_journals_description() }}</template>
    <UiToggleGroup
      :model-value="config.journals ?? []"
      :options="journalOptions"
      @update:model-value="updateJournals"
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
