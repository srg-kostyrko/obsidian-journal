<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/valibot";
import * as v from "valibot";
import { useForm } from "vee-validate";
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { journalConfigCollection, type JournalWrite } from "@/journals";
import { SettingsService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

const api = useModal<{ name: string; write: JournalWrite }>();
const settings = useService(SettingsService);
const collection = computed(() => settings.getCollection(journalConfigCollection));

const anchorRegex = /^\d{4}-\d{2}-\d{2}$/;

const { defineField, errorBag, handleSubmit, values } = useForm({
  initialValues: {
    name: "",
    type: "day" as JournalWrite["type"],
    every: "day" as Exclude<JournalWrite["type"], "custom">,
    duration: 1,
    anchorDate: "",
  },
  validationSchema: toTypedSchema(
    v.pipe(
      v.object({
        name: v.pipe(
          v.string(),
          v.nonEmpty(m.journal_name_required_error()),
          v.check(
            (value) => value.length === 0 || collection.value.get(value) === undefined,
            m.journal_name_unique_error(),
          ),
        ),
        type: v.picklist(["day", "week", "month", "quarter", "year", "custom"]),
        every: v.picklist(["day", "week", "month", "quarter", "year"]),
        duration: v.pipe(v.number(), v.integer(), v.minValue(1)),
        anchorDate: v.string(),
      }),
      v.forward(
        v.partialCheck(
          [["type"], ["anchorDate"]],
          ({ type, anchorDate }) => (type === "custom" ? anchorRegex.test(anchorDate) : true),
          m.journal_anchor_format_error(),
        ),
        ["anchorDate"],
      ),
    ),
  ),
});

const [name] = defineField("name");
const [type] = defineField("type");
const [every] = defineField("every");
const [duration] = defineField("duration");
const [anchorDate] = defineField("anchorDate");

const isCustom = computed(() => values.type === "custom");

const onSubmit = handleSubmit((vs) => {
  const write: JournalWrite =
    vs.type === "custom"
      ? { type: "custom", every: vs.every, duration: vs.duration, anchorDate: vs.anchorDate as never }
      : { type: vs.type };
  api.submit({ name: vs.name, write });
});
</script>

<template>
  <form @submit.prevent="onSubmit">
    <UiSettingRow :name="m.journal_add_modal_name_label()">
      <template #description>
        <span v-for="error of errorBag.name" :key="error" class="journal-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="name" />
    </UiSettingRow>
    <UiSettingRow :name="m.journal_add_modal_write_label()">
      <UiDropdown v-model="type">
        <option value="day">{{ m.journal_write({ type: "day", every: "day", duration: 1 }) }}</option>
        <option value="week">{{ m.journal_write({ type: "week", every: "day", duration: 1 }) }}</option>
        <option value="month">{{ m.journal_write({ type: "month", every: "day", duration: 1 }) }}</option>
        <option value="quarter">{{ m.journal_write({ type: "quarter", every: "day", duration: 1 }) }}</option>
        <option value="year">{{ m.journal_write({ type: "year", every: "day", duration: 1 }) }}</option>
        <option value="custom">custom</option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow v-if="isCustom" :name="m.journal_add_modal_duration_label()">
      <UiNumberInput v-model="duration" :min="1" />
    </UiSettingRow>
    <UiSettingRow v-if="isCustom" :name="m.journal_add_modal_every_label()">
      <UiDropdown v-model="every">
        <option value="day">day</option>
        <option value="week">week</option>
        <option value="month">month</option>
        <option value="quarter">quarter</option>
        <option value="year">year</option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow v-if="isCustom" :name="m.journal_add_modal_anchor_label()">
      <template #description>
        <div>{{ m.journal_add_modal_anchor_description() }}</div>
        <span v-for="error of errorBag.anchorDate" :key="error" class="journal-form-error">{{ error }}</span>
      </template>
      <UiTextInput v-model="anchorDate" placeholder="YYYY-MM-DD" />
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta type="submit" @click="onSubmit">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </form>
</template>

<style scoped>
.journal-form-error {
  color: var(--text-error);
  display: block;
}
</style>
