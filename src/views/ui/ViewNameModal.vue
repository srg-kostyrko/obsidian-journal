<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";

import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiIconSuggest from "@/ui/UiIconSuggest.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import { FALLBACK_VIEW_ICON } from "../config";

const props = withDefaults(defineProps<{ currentName?: string }>(), { currentName: undefined });

const api = useModal<{ name: string; icon: string }>();

const isCreating = props.currentName === undefined;

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: { name: props.currentName ?? "", icon: isCreating ? FALLBACK_VIEW_ICON : "" },
  validationSchema: toTypedSchema(
    v.object({
      name: v.pipe(
        v.string(),
        v.nonEmpty(m.view_name_required_error()),
        v.check((value) => isCreating || value !== props.currentName, m.view_name_unchanged_error()),
      ),
      icon: v.string(),
    }),
  ),
});

const [name, nameAttrs] = defineField("name");
const [icon, iconAttrs] = defineField("icon");

const onSubmit = handleSubmit((values) => {
  api.submit({ name: values.name, icon: values.icon });
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

    <!-- Renaming keeps its single-question focus; an existing view's icon is edited on its subpage. -->
    <UiSettingRow v-if="isCreating" :name="m.common_label_icon()">
      <template #description>{{ m.view_edit_icon_description() }}</template>
      <UiIconSuggest v-model="icon" v-bind="iconAttrs" />
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit">{{ isCreating ? m.common_action_create() : m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.view-form-error {
  color: var(--text-error);
  display: block;
}
</style>
