<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";

import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

const props = withDefaults(defineProps<{ currentName?: string }>(), { currentName: undefined });

const api = useModal<string>();

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: { name: props.currentName ?? "" },
  validationSchema: toTypedSchema(
    v.object({
      name: v.pipe(
        v.string(),
        v.nonEmpty(m.view_name_required_error()),
        v.check(
          (value) => props.currentName === undefined || value !== props.currentName,
          m.view_name_unchanged_error(),
        ),
      ),
    }),
  ),
});

const [name, nameAttrs] = defineField("name");

const onSubmit = handleSubmit((values) => {
  api.submit(values.name);
});
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow :name="m.common_label_name()">
      <template #description>
        <span v-for="error of errorBag.name" :key="error" class="view-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="name" v-bind="nameAttrs" />
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{
        currentName === undefined ? m.common_action_create() : m.common_action_submit()
      }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.view-form-error {
  color: var(--text-error);
  display: block;
}
</style>
