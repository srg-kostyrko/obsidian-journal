<script setup lang="ts">
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianTextInput from "../../obsidian/components/ObsidianTextInput.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import { usePlugin } from "@/composables/use-plugin";
import { useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import FormErrors from "../FormErrors.vue";

const props = defineProps<{
  name: string;
}>();
const emit = defineEmits<{
  (event: "save", name: string): void;
  (event: "close"): void;
}>();

const plugin = usePlugin();

function isNameNotUnique(value: string) {
  return value === props.name || (value !== props.name && !plugin.hasJournal(value));
}

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: {
    journalName: props.name,
  },
  validationSchema: toTypedSchema(
    v.object({
      journalName: v.pipe(
        v.string(),
        v.nonEmpty("Journal name is required"),
        v.check(isNameNotUnique, "Journal name should be unique"),
      ),
    }),
  ),
});
const [journalName, journalNameAttrs] = defineField("journalName");

const onSubmit = handleSubmit((values) => {
  if (values.journalName !== props.name) {
    emit("save", values.journalName);
  }
  emit("close");
});
</script>

<template>
  <form @submit.prevent="onSubmit">
    <ObsidianSetting name="New name">
      <template #description>
        Renaming journal will require restart if you have ribbon icons and/or commands configured.
        <FormErrors :errors="errorBag.journalName" />
      </template>
      <ObsidianTextInput v-model="journalName" v-bind="journalNameAttrs" />
    </ObsidianSetting>
    <ObsidianSetting>
      <ObsidianButton @click="$emit('close')">Cancel</ObsidianButton>
      <ObsidianButton cta type="submit">Save</ObsidianButton>
    </ObsidianSetting>
  </form>
</template>

<style scoped></style>
