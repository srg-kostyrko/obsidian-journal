<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTemplateInput from "@/ui/UiTemplateInput.vue";

import { JournalsViewModel } from "../../../view-model";
import CodeBlockReferenceHint from "../CodeBlockReferenceHint.vue";
import TemplaterSupportHint from "../TemplaterSupportHint.vue";
import TemplateStringPreview from "../TemplateStringPreview.vue";
import VariableReferenceHint from "../VariableReferenceHint.vue";

const { journalName, typeId } = defineProps<{ journalName: string; typeId?: string }>();

const journalsVM = useService(JournalsViewModel);
const config = computed(() => journalsVM.getJournal(journalName).getOrUndefined());
const owner = computed(() => (typeId === undefined ? config.value : config.value?.notelets[typeId]));

const expanded = ref(false);

const hasCycle = computed(() => config.value !== undefined && config.value.write.type !== "day");
const numberingVariableNames = computed<readonly string[]>(() =>
  config.value?.numbering.enabled ? config.value.numbering.sources.map((source) => source.variable) : [],
);
// A notelet's render context carries the journal's numbering digits but the type's own answers.
const promptVariables = computed(() => owner.value?.prompts ?? []);

function addTemplate(): void {
  if (!owner.value) return;
  owner.value.templates.push("");
  expanded.value = true;
}
function removeTemplate(index: number): void {
  if (!owner.value) return;
  owner.value.templates.splice(index, 1);
}
</script>

<template>
  <UiCollapsibleBlock v-if="owner && config" v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow :icon="icons.section.templates">
        {{ m.journal_edit_section_templates() }}
        <span class="flair">{{ owner.templates.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton :icon="icons.action.add" :tooltip="m.journal_edit_template_add_button()" @click="addTemplate" />
    </template>

    <UiSettingRow>
      <template #description>
        <div>{{ m.journal_edit_templates_description() }}</div>
        <div>
          <VariableReferenceHint
            context="template-path"
            :journal-name="journalName"
            :date-format="config.dateFormat"
            :has-cycle="hasCycle"
            :numbering-variable-names="numberingVariableNames"
            :prompt-variables="promptVariables"
          />
        </div>
        <div><CodeBlockReferenceHint :journal-name="journalName" /></div>
        <div><TemplaterSupportHint /></div>
      </template>
    </UiSettingRow>

    <template v-for="(_path, index) in owner.templates" :key="index">
      <UiSettingRow controls-only class="template-row">
        <UiTemplateInput
          v-model="owner.templates[index]"
          class="grow"
          :placeholder="m.journal_edit_template_path_placeholder()"
        />
        <UiIconButton
          :icon="icons.action.delete"
          :tooltip="m.journal_edit_template_remove_tooltip()"
          @click="removeTemplate(index)"
        />
      </UiSettingRow>
      <div class="template-path-preview">
        <TemplateStringPreview
          :journal-name="journalName"
          :value="owner.templates[index] ?? ''"
          :label="m.journal_edit_template_path_preview_label()"
        />
      </div>
    </template>
  </UiCollapsibleBlock>
</template>

<style scoped>
.grow {
  flex-grow: 1;
}

.template-row :deep(.setting-item-control) {
  flex: 1;
}

.template-path-preview {
  padding: var(--size-2-2);
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
  line-height: var(--line-height-tight);
}
</style>
