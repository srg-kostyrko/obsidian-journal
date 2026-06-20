<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiFileInput from "@/ui/UiFileInput.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { JournalsViewModel } from "../../../view-model";
import CodeBlockReferenceHint from "../CodeBlockReferenceHint.vue";
import TemplatePathPreview from "../TemplatePathPreview.vue";
import TemplaterSupportHint from "../TemplaterSupportHint.vue";
import VariableReferenceHint from "../VariableReferenceHint.vue";

import type { JournalConfig } from "../../../config";

const { journalName } = defineProps<{ journalName: string }>();

const journalsVM = useService(JournalsViewModel);
const config = computed<JournalConfig | undefined>(() => journalsVM.getJournal(journalName).getOr(undefined as never));

const expanded = ref(false);

const hasCycle = computed(() => config.value !== undefined && config.value.write.type !== "day");
const numberingVariableNames = computed<readonly string[]>(() =>
  config.value?.numbering.enabled ? config.value.numbering.sources.map((source) => source.variable) : [],
);

function addTemplate(): void {
  if (!config.value) return;
  config.value.templates.push("");
  expanded.value = true;
}
function removeTemplate(index: number): void {
  if (!config.value) return;
  config.value.templates.splice(index, 1);
}
</script>

<template>
  <UiCollapsibleBlock v-if="config" v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow :icon="icons.section.templates">
        {{ m.journal_edit_section_templates() }}
        <span class="flair">{{ config.templates.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiButton @click="addTemplate">{{ m.journal_edit_template_add_button() }}</UiButton>
    </template>

    <UiSettingRow>
      <template #description>
        <div>{{ m.journal_edit_templates_description() }}</div>
        <VariableReferenceHint
          context="template-path"
          :journal-name="journalName"
          :date-format="config.dateFormat"
          :has-cycle="hasCycle"
          :numbering-variable-names="numberingVariableNames"
        />
        <CodeBlockReferenceHint :journal-name="journalName" />
        <TemplaterSupportHint />
      </template>
    </UiSettingRow>

    <template v-for="(_path, index) in config.templates" :key="index">
      <UiSettingRow>
        <UiFileInput
          v-model="config.templates[index]"
          class="grow"
          :placeholder="m.journal_edit_template_path_placeholder()"
        />
        <UiIconButton
          :icon="icons.action.delete"
          :tooltip="m.journal_edit_template_remove_tooltip()"
          @click="removeTemplate(index)"
        />
      </UiSettingRow>
      <TemplatePathPreview :journal-name="journalName" :path="config.templates[index] ?? ''" />
    </template>
  </UiCollapsibleBlock>
</template>

<style scoped>
.grow {
  flex-grow: 1;
}
</style>
