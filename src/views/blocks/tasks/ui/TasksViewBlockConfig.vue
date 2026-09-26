<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModalService } from "@/infrastructure/host/modals";
import { JournalsViewModel } from "@/journals";
import { composeFilters } from "@/tasks/filter";
import { taskSorts, type TaskQuery } from "@/tasks/query";
import { describeTaskRule } from "@/tasks/ui/describe-task-rule";
import { editTaskFilterModal } from "@/tasks/ui/modals";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggleGroup from "@/ui/UiToggleGroup.vue";

import { windowKinds } from "../../custom-intervals/window-resolution";

import type { TasksViewBlockConfig, TasksViewBlockConfigChange } from "../tasks-view-block";

const props = defineProps<{ config: TasksViewBlockConfig; onChange: TasksViewBlockConfigChange }>();

const modals = useModalService();
const journals = useService(JournalsViewModel);

const update = (patch: Partial<TasksViewBlockConfig>): void => props.onChange({ ...props.config, ...patch });

const journalOptions = computed(() =>
  journals.journals.value.map((journal) => ({ value: journal.name, label: journal.name })),
);

const sourceLabels: Record<TaskQuery["scope"]["source"], () => string> = {
  note: () => m.view_block_tasks_source_note(),
  notelets: () => m.view_block_tasks_source_notelets(),
  both: () => m.view_block_tasks_source_both(),
};

const sortLabels: Record<(typeof taskSorts)[number], () => string> = {
  document: () => m.view_block_tasks_sort_document(),
  status: () => m.view_block_tasks_sort_status(),
  due: () => m.view_block_tasks_sort_due(),
  scheduled: () => m.view_block_tasks_sort_scheduled(),
  start: () => m.view_block_tasks_sort_start(),
  done: () => m.view_block_tasks_sort_done(),
  created: () => m.view_block_tasks_sort_created(),
};

function updateSource(value: string | undefined): void {
  if (value === undefined) return;
  update({ scope: { ...props.config.scope, source: value as TaskQuery["scope"]["source"] } });
}

function updateSort(value: string | undefined): void {
  if (value === undefined) return;
  update({ sort: value as TaskQuery["sort"] });
}

// Described as the composed filter, not as the stored one: a block that names no status is where
// the listing's own open-only default lands (composeFilters), so summarizing what is stored would
// say "no conditions" over a listing that shows open items only. Composing against a null journal
// filter is what this editor can honestly answer — a block spans several journals, each free to
// carry its own Status condition — so the note below names who else can fill that slot.
const filterSummary = computed(() => describeTaskRule(composeFilters(null, props.config.filter)));
const namesStatus = computed(() => props.config.filter.conditions.some((condition) => condition.type === "status"));

function editFilter(): void {
  // With the mode control, unlike a journal's row: this filter is the query composeFilters answers
  // with, so its Match all / Match any setting is the one that applies.
  void modals
    .open(editTaskFilterModal, { filter: props.config.filter, showMode: true })
    .tap((filter) => update({ filter }));
}
</script>

<template>
  <UiSettingRow :name="m.view_block_config_window_label()">
    <UiDropdown
      :model-value="config.window"
      @update:model-value="
        (value: string | undefined) => value && update({ window: value as TasksViewBlockConfig['window'] })
      "
    >
      <option v-for="kind of windowKinds" :key="kind" :value="kind">
        {{ m.view_block_config_window_selected({ period: kind }) }}
      </option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow v-if="journalOptions.length > 0" :name="m.view_block_tasks_journals_label()">
    <template #description>{{ m.view_block_tasks_journals_description() }}</template>
    <UiToggleGroup
      :model-value="config.journals ?? []"
      :options="journalOptions"
      @update:model-value="(value: string[]) => update({ journals: value.length > 0 ? value : undefined })"
    />
  </UiSettingRow>
  <UiSettingRow :name="m.view_block_tasks_source_label()">
    <UiDropdown :model-value="config.scope.source" @update:model-value="updateSource">
      <option v-for="source of ['note', 'notelets', 'both'] as const" :key="source" :value="source">
        {{ sourceLabels[source]() }}
      </option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.view_block_tasks_sort_label()">
    <UiDropdown :model-value="config.sort" @update:model-value="updateSort">
      <option v-for="sort of taskSorts" :key="sort" :value="sort">
        {{ sortLabels[sort]() }}
      </option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.view_block_tasks_filter_label()">
    <template #description>
      <span data-testid="task-filter-summary">{{ filterSummary }}</span>
      <span v-if="!namesStatus" class="tasks-view-block-filter-note" data-testid="task-filter-status-default">
        {{ m.view_block_tasks_filter_status_default() }}
      </span>
    </template>
    <UiButton data-testid="task-filter-edit" @click="editFilter">{{ m.tasks_journal_filter_edit() }}</UiButton>
  </UiSettingRow>
</template>

<style scoped>
/* Its own line: the summary above states what this block filters by, and this states who else gets
   to decide the part the block left unstated — two claims, not one sentence. */
.tasks-view-block-filter-note {
  display: block;
}
</style>
