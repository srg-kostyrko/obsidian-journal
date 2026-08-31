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

const { journalName, typeId } = defineProps<{ journalName: string; typeId: string }>();
const api = useModal<{ newValue: string }>();
const journalsVM = useService(JournalsViewModel);

const config = computed(() => journalsVM.getJournal(journalName).getOrUndefined());
const type = computed(() => config.value?.notelets[typeId]);
const currentValue = computed(() => type.value?.counter.frontmatterKey ?? "");

// The counter is written after the claim, the date and the type key, so a collision destroys
// one of them silently. The set is the notelet's own: a notelet never carries the journal's
// numbering or question keys, and never another type's, so those stay free to reuse.
const takenKeys = computed(() =>
  [
    ...(config.value ? reservedFrontmatterKeys(config.value) : []),
    ...(type.value?.prompts.map((prompt) => prompt.frontmatterKey) ?? []),
  ].filter((key) => key !== ""),
);

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
        <span v-for="error of errorBag.newValue" :key="error" class="notelet-form-error">{{ error }}</span>
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
.notelet-form-error {
  color: var(--text-error);
  display: block;
}
</style>
