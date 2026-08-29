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

import { isRequired } from "../../../prompts/config";
import { JournalsViewModel } from "../../../view-model";
import { EditPromptFlow } from "../../flows/edit-prompt.flow";
import { usePromptAutocreateGuard } from "../use-prompt-autocreate-guard";

const { journalName } = defineProps<{ journalName: string }>();

const flows = useService(Flows);
const journalsVM = useService(JournalsViewModel);
const config = computed(() => journalsVM.getJournal(journalName).getOrUndefined());
usePromptAutocreateGuard(config);

const expanded = ref(false);

const prompts = computed(() => config.value?.prompts ?? []);
const hasRequiredWithAutoCreate = computed(() => (config.value?.autoCreate ?? false) && prompts.value.some(isRequired));

function addPrompt(): void {
  void flows.invoke(EditPromptFlow, { journalName });
}
function editPrompt(promptIndex: number): void {
  void flows.invoke(EditPromptFlow, { journalName, promptIndex });
}
function deletePrompt(promptIndex: number): void {
  config.value?.prompts.splice(promptIndex, 1);
}
</script>

<template>
  <UiCollapsibleBlock v-if="config" v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow :icon="icons.section.prompts">
        {{ m.journal_prompt_section_title() }}
        <span v-if="prompts.length > 0" class="flair">{{ prompts.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton :icon="icons.action.add" :tooltip="m.journal_prompt_add()" @click="addPrompt" />
    </template>

    <UiSettingRow no-controls>
      <template #description>{{ m.journal_prompt_section_description() }}</template>
    </UiSettingRow>

    <UiSettingRow v-if="prompts.length === 0" no-controls>
      <template #description>{{ m.journal_prompt_section_empty() }}</template>
    </UiSettingRow>

    <div v-if="hasRequiredWithAutoCreate" class="journal-hint">
      {{ m.journal_prompt_autocreate_required_warning() }}
    </div>

    <div v-for="(prompt, promptIndex) of prompts" :key="prompt.variable" class="prompt-row">
      <span class="prompt-row__main">
        <span class="prompt-row__question">{{ prompt.question }}</span>
        <span class="flair">{{ m.journal_prompt_type_option({ type: prompt.type }) }}</span>
      </span>
      <span class="prompt-row__variable">{{ prompt.variable }}</span>
      <span class="prompt-row__actions">
        <UiIconButton
          :icon="icons.action.configure"
          :tooltip="m.journal_prompt_edit()"
          @click="editPrompt(promptIndex)"
        />
        <UiIconButton
          :icon="icons.action.delete"
          :tooltip="m.journal_prompt_delete()"
          @click="deletePrompt(promptIndex)"
        />
      </span>
    </div>
  </UiCollapsibleBlock>
</template>

<style scoped>
.journal-hint {
  color: var(--text-warning);
}
.prompt-row {
  display: flex;
  align-items: center;
  gap: var(--size-4-2);
  padding-block: var(--size-2-3);
  border-bottom: 1px solid var(--background-modifier-border);
}
.prompt-row:last-of-type {
  border-bottom: 0;
}
.prompt-row__main {
  display: inline-flex;
  align-items: center;
  gap: var(--size-4-2);
  flex: 1 1 auto;
  min-width: 0;
}
.prompt-row__question {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prompt-row__variable {
  font-family: var(--font-monospace);
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
}
.prompt-row__actions {
  display: inline-flex;
  gap: var(--size-2-1);
  --icon-size: var(--icon-s);
}
</style>
