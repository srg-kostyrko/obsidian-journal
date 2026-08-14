<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { JournalsViewModel } from "@/journals/view-model";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

const { suggestedName } = defineProps<{ sourceName: string; suggestedName: string }>();
const api = useModal<{ newName: string }>();
const journalsVM = useService(JournalsViewModel);

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: { newName: suggestedName },
  validationSchema: toTypedSchema(
    v.object({
      newName: v.pipe(
        v.string(),
        v.nonEmpty(m.journal_name_required_error()),
        v.check((value) => journalsVM.isJournalNameAvailable(value), m.journal_name_unique_error()),
      ),
    }),
  ),
});

const [newName, newNameAttrs] = defineField("newName");

const onSubmit = handleSubmit((vs) => api.submit({ newName: vs.newName }));
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow :name="m.journal_clone_modal_name_label()">
      <template #description>
        <div>{{ m.journal_clone_modal_description() }}</div>
        <span v-for="error of errorBag.newName" :key="error" class="journal-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="newName" v-bind="newNameAttrs" />
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
