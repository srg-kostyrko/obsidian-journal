<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { NoteletPathService } from "../../../notelets/notelet-path";
import { EmptyNoteNameError } from "../../../notes/errors";
import { JournalsViewModel } from "../../../view-model";
import { EditNoteletCounterKeyFlow } from "../../flows/edit-notelet-counter-key.flow";
import FolderInput from "../FolderInput.vue";
import { useTodayMetadata } from "../use-today-metadata";
import VariableReferenceHint from "../VariableReferenceHint.vue";
import { templateHasWrongWeek } from "../wrong-week";
import WrongWeekWarning from "../WrongWeekWarning.vue";

import type { TypeId } from "../../../notelets/config";

const props = defineProps<{ journalName: string; typeId: string }>();

const flows = useService(Flows);
const journalsVM = useService(JournalsViewModel);
const paths = useService(NoteletPathService);
const metadata = useTodayMetadata(props.journalName);

const config = computed(() => journalsVM.getJournal(props.journalName).getOrUndefined());
const type = computed(() => config.value?.notelets[props.typeId]);

const expanded = ref(true);

const hasCycle = computed(() => config.value !== undefined && config.value.write.type !== "day");
const numberingVariableNames = computed<readonly string[]>(() =>
  config.value?.numbering.enabled ? config.value.numbering.sources.map((source) => source.variable) : [],
);
const promptVariables = computed(() => type.value?.prompts ?? []);

type Resolved = { kind: "path"; path: string } | { kind: "empty" } | undefined;

const previewPath = computed<Resolved>(() => {
  const period = metadata.value;
  const journal = config.value;
  const noteletType = type.value;
  if (!period || !journal || !noteletType) return;
  const result = paths.availablePathFor(journal, noteletType, {
    kind: "notelet",
    journalName: journal.name,
    anchor: period.anchor,
    typeId: props.typeId as TypeId,
  });
  if (result.isErr()) {
    return result.error instanceof EmptyNoteNameError ? { kind: "empty" } : undefined;
  }
  return { kind: "path", path: result.value };
});

function editCounterKey(): void {
  void flows.invoke(EditNoteletCounterKeyFlow, { journalName: props.journalName, typeId: props.typeId });
}
</script>

<template>
  <UiCollapsibleBlock v-if="type && config" v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow :icon="icons.action.addFile">{{ m.journal_edit_section_note_creation() }}</UiIconedRow>
    </template>

    <div v-if="previewPath?.kind === 'empty'" class="journal-hint">
      {{ m.journal_edit_name_template_empty_warning() }}
    </div>
    <div v-else-if="previewPath?.kind === 'path'" class="notelet-path-preview">
      {{ m.journal_edit_note_path_preview_label() }}
      <b class="u-pop">{{ previewPath.path }}</b>
    </div>

    <UiSettingRow :name="m.journal_notelet_name_template_label()">
      <template #description>
        <VariableReferenceHint
          context="name-template"
          notelet
          :journal-name="props.journalName"
          :date-format="config.dateFormat"
          :has-cycle="hasCycle"
          :numbering-variable-names="numberingVariableNames"
          :prompt-variables="promptVariables"
        />
      </template>
      <UiTextInput v-model="type.nameTemplate" />
    </UiSettingRow>

    <UiSettingRow :name="m.journal_notelet_folder_label()">
      <template #description>
        <VariableReferenceHint
          context="folder-path"
          notelet
          :journal-name="props.journalName"
          :date-format="config.dateFormat"
          :has-cycle="hasCycle"
          :numbering-variable-names="numberingVariableNames"
          :prompt-variables="promptVariables"
        />
        <WrongWeekWarning v-if="templateHasWrongWeek(type.folder)" />
      </template>
      <FolderInput v-model="type.folder" />
    </UiSettingRow>

    <UiSettingRow :name="m.journal_notelet_counter_label()">
      <template #description>{{ m.journal_notelet_counter_description() }}</template>
      <UiToggle v-model="type.counter.enabled" />
    </UiSettingRow>

    <UiSettingRow v-if="type.counter.enabled" :name="m.common_label_property_name()">
      {{ type.counter.frontmatterKey }}
      <UiIconButton
        :icon="icons.action.edit"
        :tooltip="m.journal_notelet_counter_key_modal_title()"
        @click="editCounterKey"
      />
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>

<style scoped>
.journal-hint {
  color: var(--text-warning);
}
.notelet-path-preview {
  padding-bottom: var(--size-4-2);
}
/* Preserve significant whitespace in a resolved path so spaces render literally,
   while still letting a deep path wrap instead of overflowing the pane. */
b {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
