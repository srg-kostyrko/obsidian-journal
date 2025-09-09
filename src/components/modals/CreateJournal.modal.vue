<script setup lang="ts">
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianTextInput from "../../obsidian/components/ObsidianTextInput.vue";
import ObsidianDropdown from "../obsidian/ObsidianDropdown.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import { type JournalSettings } from "../../types/settings.types";
import { useForm } from "vee-validate";
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import ObsidianNumberInput from "../obsidian/ObsidianNumberInput.vue";
import DatePicker from "../DatePicker.vue";
import FormErrors from "../FormErrors.vue";
import { JournalAnchorDate } from "@/types/journal.types";
import { usePlugin } from "@/composables/use-plugin";

const emit = defineEmits<{
  (event: "create", name: string, write: JournalSettings["write"]): void;
  (event: "close"): void;
}>();

const plugin = usePlugin();

function isNameNotUnique(value: string) {
  return !plugin.hasJournal(value);
}

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: {
    journalName: "",
    write: "day",
    every: "day",
    duration: 1,
    anchorDate: "",
  },
  validationSchema: toTypedSchema(
    v.pipe(
      v.object({
        journalName: v.pipe(
          v.string(),
          v.nonEmpty("Journal name is required"),
          v.check(isNameNotUnique, "Journal name should be unique"),
        ),
        write: v.picklist(["day", "week", "month", "quarter", "year", "custom"]),
        every: v.picklist(["day", "week", "month", "quarter", "year"]),
        duration: v.number(),
        anchorDate: v.string(),
      }),
      v.forward(
        v.partialCheck(
          [["write"], ["anchorDate"]],
          (input) => {
            return input.write === "custom" ? Boolean(input.anchorDate) : true;
          },
          "Please select an anchor date.",
        ),
        ["anchorDate"],
      ),
    ),
  ),
});

const [journalName, journalNameAttrs] = defineField("journalName");
const [write, writeAttrs] = defineField("write");
const [every, everyAttrs] = defineField("every");
const [duration, durationAttrs] = defineField("duration");
const [anchorDate, anchorDateAttrs] = defineField("anchorDate");

const onSubmit = handleSubmit((values) => {
  emit(
    "create",
    values.journalName,
    values.write === "custom"
      ? {
          type: "custom",
          every: values.every,
          duration: values.duration,
          anchorDate: JournalAnchorDate(values.anchorDate),
        }
      : {
          type: values.write,
        },
  );
  emit("close");
});
</script>

<template>
  <form @submit.prevent="onSubmit">
    <ObsidianSetting name="Journal name">
      <template #description>
        <FormErrors :errors="errorBag.journalName" />
      </template>
      <ObsidianTextInput v-model="journalName" placeholder="ex. Work" v-bind="journalNameAttrs" />
    </ObsidianSetting>
    <ObsidianSetting name="I'll be writing">
      <ObsidianDropdown v-model="write" v-bind="writeAttrs">
        <option value="day">Daily</option>
        <option value="week">Weekly</option>
        <option value="month">Monthly</option>
        <option value="quarter">Quarterly</option>
        <option value="year">Annually</option>
        <option value="custom">In custom intervals</option>
      </ObsidianDropdown>
    </ObsidianSetting>
    <ObsidianSetting v-if="write === 'custom'" name="Every">
      <ObsidianNumberInput v-model="duration" v-bind="durationAttrs" :min="1" />
      <ObsidianDropdown v-model="every" v-bind="everyAttrs">
        <option value="day">days</option>
        <option value="week">weeks</option>
        <option value="month">months</option>
        <option value="quarter">quarters</option>
        <option value="year">years</option>
      </ObsidianDropdown>
    </ObsidianSetting>
    <ObsidianSetting v-if="write === 'custom'" name="Start date">
      <template #description>
        This date will be used to start counting intervals. It cannot be changed after creating journal.
        <FormErrors :errors="errorBag.anchorDate" />
      </template>
      <DatePicker v-model="anchorDate" v-bind="anchorDateAttrs" />
    </ObsidianSetting>
    <ObsidianSetting>
      <ObsidianButton @click="emit('close')">Close</ObsidianButton>
      <ObsidianButton cta type="submit" @click="onSubmit">Add</ObsidianButton>
    </ObsidianSetting>
  </form>
</template>
