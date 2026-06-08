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

import type { FrontmatterFieldName } from "./modals";

const { journalName, fieldName } = defineProps<{ journalName: string; fieldName: FrontmatterFieldName }>();
const api = useModal<{ newValue: string }>();
const journalsVM = useService(JournalsViewModel);

const currentValue = computed(() => {
  return journalsVM.getJournal(journalName).getOr(undefined as never)?.frontmatter[fieldName] ?? "";
});

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: { newValue: currentValue.value },
  validationSchema: toTypedSchema(
    v.object({ newValue: v.pipe(v.string(), v.nonEmpty(m.journal_property_name_required())) }),
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
        <div>{{ m.journal_notes_not_rewritten_hint() }}</div>
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
