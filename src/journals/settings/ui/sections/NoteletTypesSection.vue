<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { SettingsUiService } from "@/settings";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { JournalsViewModel } from "../../../view-model";
import { AddNoteletTypeFlow } from "../../flows/add-notelet-type.flow";
import { noteletTypeSubpage } from "../notelet-type-subpage";

const { journalName } = defineProps<{ journalName: string }>();

const flows = useService(Flows);
const ui = useService(SettingsUiService);
const journalsVM = useService(JournalsViewModel);
const config = computed(() => journalsVM.getJournal(journalName).getOrUndefined());

const expanded = ref(false);

const types = computed(() => Object.entries(config.value?.notelets ?? {}));

function addType(): void {
  void flows.invoke(AddNoteletTypeFlow, { journalName });
}
function editType(typeId: string): void {
  ui.push(noteletTypeSubpage, { journalName, typeId });
}
</script>

<template>
  <UiCollapsibleBlock v-if="config" v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow :icon="icons.section.notelets">
        {{ m.journal_notelet_section_title() }}
        <span v-if="types.length > 0" class="flair">{{ types.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton :icon="icons.action.add" :tooltip="m.journal_notelet_add()" @click="addType" />
    </template>

    <UiSettingRow no-controls>
      <template #description>{{ m.journal_notelet_section_description() }}</template>
    </UiSettingRow>

    <UiSettingRow v-if="types.length === 0" no-controls>
      <template #description>{{ m.journal_notelet_section_empty() }}</template>
    </UiSettingRow>

    <div v-for="[typeId, type] of types" :key="typeId" class="notelet-type-row">
      <span class="notelet-type-row__name">{{ type.name }}</span>
      <UiIconButton :icon="icons.action.configure" :tooltip="m.journal_notelet_edit()" @click="editType(typeId)" />
    </div>
  </UiCollapsibleBlock>
</template>

<style scoped>
.notelet-type-row {
  display: flex;
  align-items: center;
  gap: var(--size-4-2);
  padding-block: var(--size-2-3);
  border-bottom: 1px solid var(--background-modifier-border);
}
.notelet-type-row:last-of-type {
  border-bottom: 0;
}
.notelet-type-row__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
