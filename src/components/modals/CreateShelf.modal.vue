<script setup lang="ts">
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianTextInput from "../obsidian/ObsidianTextInput.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import { useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import FormErrors from "../FormErrors.vue";
import { pluginSettings$ } from "@/stores/settings.store";

const emit = defineEmits<{
  (event: "create", name: string): void;
  (event: "close"): void;
}>();

function isNameNotUnique(value: string) {
  return !(value in pluginSettings$.value.shelves);
}

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: {
    name: "",
  },
  validationSchema: toTypedSchema(
    v.object({
      name: v.pipe(
        v.string(),
        v.nonEmpty("Shelf name is required"),
        v.check(isNameNotUnique, "Shelf name should be unique"),
      ),
    }),
  ),
});

const [name, nameAttrs] = defineField("name");

const onSubmit = handleSubmit((values) => {
  emit("create", values.name);
  emit("close");
});
</script>

<template>
  <form @submit.prevent="onSubmit">
    <ObsidianSetting name="Journal name">
      <template #description>
        <FormErrors :errors="errorBag.name" />
      </template>
      <ObsidianTextInput v-model="name" placeholder="ex. Work" v-bind="nameAttrs" />
    </ObsidianSetting>
    <ObsidianSetting>
      <ObsidianButton @click="emit('close')">Close</ObsidianButton>
      <ObsidianButton cta type="submit" @click="onSubmit">Add</ObsidianButton>
    </ObsidianSetting>
  </form>
</template>
