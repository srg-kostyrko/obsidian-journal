<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { JournalsViewModel } from "@/journals/view-model";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import { reservedFrontmatterKeys } from "../../config";

import type { FrontmatterFieldName } from "./modals";

const { journalName, fieldName } = defineProps<{ journalName: string; fieldName: FrontmatterFieldName }>();
const api = useModal<{ newValue: string }>();
const journalsVM = useService(JournalsViewModel);

const config = computed(() => journalsVM.getJournal(journalName).getOrUndefined());

const currentValue = computed(() => config.value?.frontmatter[fieldName] ?? "");

// Everything else this journal writes to a note it owns — its other fields, its numbering
// digits and questions, and every notelet type's counter and answers. The period mutator and
// the notelet mutator both write these fields last, so a collision silently overwrites one.
const takenKeys = computed(() => {
  const journal = config.value;
  if (!journal) return [];
  return [
    ...reservedFrontmatterKeys(journal).filter((key) => key !== currentValue.value),
    ...journal.numbering.sources.map((source) => source.frontmatterKey),
    ...journal.prompts.map((prompt) => prompt.frontmatterKey),
    ...Object.values(journal.notelets).flatMap((type) => [
      type.counter.frontmatterKey,
      ...type.prompts.map((prompt) => prompt.frontmatterKey),
    ]),
  ].filter((key) => key !== "");
});

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: { newValue: currentValue.value },
  validationSchema: toTypedSchema(
    v.object({
      newValue: v.pipe(
        v.string(),
        v.nonEmpty(m.journal_property_name_required()),
        v.check(
          (value) => !takenKeys.value.includes(value),
          (issue) => m.journal_property_key_taken({ name: issue.input }),
        ),
      ),
    }),
  ),
});

const [newValue, newValueAttrs] = defineField("newValue");

const onSubmit = handleSubmit((vs) => api.submit({ newValue: vs.newValue }));
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow :name="m.journal_property_modal_current_label()">{{ currentValue }}</UiSettingRow>
    <UiSettingRow :name="m.common_label_new_name()">
      <template #description>
        <span v-for="error of errorBag.newValue" :key="error" class="journal-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="newValue" v-bind="newValueAttrs" />
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.journal-form-error {
  color: var(--text-error);
  display: block;
}
</style>
