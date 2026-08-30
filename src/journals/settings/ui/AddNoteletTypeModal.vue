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

const props = defineProps<{ journalName: string }>();
const api = useModal<{ name: string }>();
const journalsVM = useService(JournalsViewModel);

// Frontmatter stores the type's name and parseEntry resolves a type by matching it, so two types
// of one journal sharing a name would make every notelet of either ambiguous.
const takenNames = computed(() =>
  Object.values(journalsVM.getJournal(props.journalName).getOrUndefined()?.notelets ?? {}).map((type) => type.name),
);

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: { name: "" },
  validationSchema: toTypedSchema(
    v.object({
      name: v.pipe(
        v.string(),
        v.nonEmpty(m.journal_notelet_name_required_error()),
        v.check((value) => !takenNames.value.includes(value), m.journal_notelet_name_unique_error()),
      ),
    }),
  ),
});

const [name, nameAttrs] = defineField("name");

const onSubmit = handleSubmit((values) => api.submit({ name: values.name }));
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow :name="m.journal_notelet_name_label()">
      <template #description>
        <span v-for="error of errorBag.name" :key="error" class="notelet-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="name" v-bind="nameAttrs" />
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
