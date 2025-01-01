<script setup lang="ts">
import { computed } from "vue";
import { useForm } from "vee-validate";
import * as v from "valibot";
import { toTypedSchema } from "@vee-validate/valibot";
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import ObsidianTextInput from "../obsidian/ObsidianTextInput.vue";
import FormErrors from "../FormErrors.vue";
import { defaultFieldNames } from "@/defaults";
import { usePlugin } from "@/composables/use-plugin";
import type { JournalSettings } from "@/types/settings.types";

const { journalName, fieldName } = defineProps<{
  journalName: string;
  fieldName: keyof JournalSettings["frontmatter"];
}>();
const emit = defineEmits<(event: "close") => void>();

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: { name: "" },
  validationSchema: toTypedSchema(
    v.object({
      name: v.pipe(v.string(), v.nonEmpty("Property name is required")),
    }),
  ),
});
const [name, nameAttrs] = defineField("name");

const plugin = usePlugin();
const journal = computed(() => plugin.getJournal(journalName));
// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
const currentName = computed(() => journal.value?.config.value.frontmatter[fieldName] || defaultFieldNames[fieldName]);

const onSubmit = handleSubmit(async (values) => {
  if (!journal.value) return;
  await journal.value.renameFrontmatterField(fieldName, currentName.value, values.name);
  emit("close");
});
</script>

<template>
  <form @submit.prevent="onSubmit">
    <ObsidianSetting name="Current mame">
      {{ currentName }}
    </ObsidianSetting>
    <ObsidianSetting name="New mame">
      <template #description>
        <FormErrors :errors="errorBag.name" />
      </template>
      <ObsidianTextInput v-model="name" v-bind="nameAttrs" />
    </ObsidianSetting>
    <ObsidianSetting>
      <ObsidianButton @click="$emit('close')">Cancel</ObsidianButton>
      <ObsidianButton cta type="submit">Update</ObsidianButton>
    </ObsidianSetting>
  </form>
</template>

<style scoped></style>
