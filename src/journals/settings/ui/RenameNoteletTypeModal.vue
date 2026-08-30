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

const props = defineProps<{ journalName: string; typeId: string; currentName: string }>();
const api = useModal<{ newName: string }>();
const journalsVM = useService(JournalsViewModel);

const notelets = computed(() => journalsVM.getJournal(props.journalName).getOrUndefined()?.notelets ?? {});
// Frontmatter stores the type's name and parseEntry resolves a type by matching it, so this is
// the only place a type's name is editable — an inline field could not refuse a collision.
const takenNames = computed(() =>
  Object.entries(notelets.value)
    .filter(([id]) => id !== props.typeId)
    .map(([, type]) => type.name),
);

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: { newName: props.currentName },
  validationSchema: toTypedSchema(
    v.object({
      newName: v.pipe(
        v.string(),
        v.nonEmpty(m.journal_notelet_name_required_error()),
        v.check((value) => !takenNames.value.includes(value), m.journal_notelet_name_unique_error()),
      ),
    }),
  ),
});

const [newName, newNameAttrs] = defineField("newName");

const onSubmit = handleSubmit((values) => api.submit({ newName: values.newName }));
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow :name="m.common_label_new_name()">
      <template #description>
        <div>{{ m.journal_notelet_name_description() }}</div>
        <span v-for="error of errorBag.newName" :key="error" class="notelet-form-error">{{ error }}</span>
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
.notelet-form-error {
  color: var(--text-error);
  display: block;
}
</style>
