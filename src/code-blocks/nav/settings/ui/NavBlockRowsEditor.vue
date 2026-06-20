<script setup lang="ts">
import { computed, ref } from "vue";

import { Clock, type AnchorString } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { JournalsViewModel, journalDefaultsFor, type JournalConfig } from "@/journals";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { periodForJournal } from "../../period-for-journal";
import NavBlockRow from "../../ui/NavBlockRow.vue";
import { EditNavBlockRowFlow } from "../flows/edit-nav-row.flow";

const {
  journalName,
  field,
  title,
  icon,
  mode = false,
  useDefaults = false,
} = defineProps<{
  journalName: string;
  field: "navBlock" | "intervalBlock";
  title: string;
  icon: string;
  mode?: boolean;
  useDefaults?: boolean;
}>();

const flows = useService(Flows);
const journalsVM = useService(JournalsViewModel);

const config = computed<JournalConfig | undefined>(() => journalsVM.getJournal(journalName).getOr(undefined as never));
const expanded = ref(false);

const todayAnchor = computed(() => Clock.now().format("YYYY-MM-DD") as AnchorString);
const previewPeriod = computed(() =>
  config.value ? periodForJournal(config.value.write, todayAnchor.value) : undefined,
);

function applyDefaults(): void {
  if (!config.value) return;
  config.value[field].rows = journalDefaultsFor(config.value.write, config.value.name)[field].rows;
}

function add(): void {
  void flows.invoke(EditNavBlockRowFlow, { journalName, field });
}
function edit(index: number): void {
  void flows.invoke(EditNavBlockRowFlow, { journalName, field, rowIndex: index });
}
function remove(index: number): void {
  config.value?.[field].rows.splice(index, 1);
}
function moveUp(index: number): void {
  const rows = config.value?.[field].rows;
  if (!rows || index <= 0) return;
  [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]];
}
function moveDown(index: number): void {
  const rows = config.value?.[field].rows;
  if (!rows || index >= rows.length - 1) return;
  [rows[index], rows[index + 1]] = [rows[index + 1], rows[index]];
}
</script>

<template>
  <UiCollapsibleBlock v-if="config" v-model:expanded="expanded">
    <template #trigger>
      <span class="journal-section-heading">
        <UiIcon :name="icon" />
        <span>{{ title }}</span>
        <span class="flair">{{ config[field].rows.length }}</span>
      </span>
    </template>
    <template #controls>
      <UiButton @click="add">{{ m.block_rows_add_row() }}</UiButton>
    </template>

    <UiSettingRow v-if="mode" :name="m.nav_block_section_mode_label()">
      <UiDropdown v-model="config[field].type">
        <option value="create">{{ m.nav_block_section_mode_option({ kind: "create" }) }}</option>
        <option value="existing">{{ m.nav_block_section_mode_option({ kind: "existing" }) }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow :name="m.block_rows_decorate_whole_label()">
      <UiToggle v-model="config[field].decorateWholeBlock" />
    </UiSettingRow>

    <UiSettingRow v-if="useDefaults && config[field].rows.length === 0" controls-only>
      <UiButton @click="applyDefaults">
        {{ m.nav_block_section_use_defaults({ writeType: config.write.type }) }}
      </UiButton>
    </UiSettingRow>

    <UiSettingRow v-if="config[field].rows.length === 0" no-controls>
      <template #description>{{ m.block_rows_empty() }}</template>
    </UiSettingRow>

    <UiSettingRow v-for="(row, index) of config[field].rows" :key="index">
      <template #description>
        <div class="nav-row-preview">
          <NavBlockRow
            :journal="config"
            :row="row"
            :ref-date="todayAnchor"
            :period="previewPeriod!"
            :prevent-navigation="true"
          />
        </div>
      </template>
      <UiIconButton
        v-if="index > 0"
        :icon="icons.action.moveUp"
        :tooltip="m.common_action_move_up()"
        @click="moveUp(index)"
      />
      <UiIconButton
        v-if="index < config[field].rows.length - 1"
        :icon="icons.action.moveDown"
        :tooltip="m.common_action_move_down()"
        @click="moveDown(index)"
      />
      <UiIconButton :icon="icons.action.configure" :tooltip="m.block_rows_edit_tooltip()" @click="edit(index)" />
      <UiIconButton :icon="icons.action.delete" :tooltip="m.block_rows_delete_tooltip()" @click="remove(index)" />
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>

<style scoped>
.journal-section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
  font-weight: var(--font-semibold);
}
.nav-row-preview {
  display: flex;
  justify-content: center;
  max-width: 240px;
  margin: 0 auto;
}
</style>
