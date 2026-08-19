<script setup lang="ts">
import { useField } from "vee-validate";
import { ref, watch } from "vue";

import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSegmentedControl from "@/ui/UiSegmentedControl.vue";

const { name } = defineProps<{ name: string }>();

const { value: unit } = useField<"words" | "characters">(`${name}.unit`);
const { value: op } = useField<"lt" | "lte" | "gt" | "gte">(`${name}.condition`);
const { value: threshold } = useField<number>(`${name}.value`);

const draft = ref<number | undefined>(threshold.value);

// Clearing the input yields a non-number, which the schema rejects — and the modal
// shows no errors and does not gate Save on validity, so an invalid field would make
// Save silently do nothing. Hold the last valid threshold instead.
const isValidThreshold = (next: number | undefined): next is number =>
  typeof next === "number" && Number.isSafeInteger(next) && next >= 0;

watch(threshold, (next) => {
  if (isValidThreshold(next)) draft.value = next;
});

watch(draft, (next) => {
  if (!isValidThreshold(next)) return;
  threshold.value = next;
});

const unitOptions = [
  { value: "words" as const, label: m.decoration_condition_note_size_unit_option({ unit: "words" }) },
  { value: "characters" as const, label: m.decoration_condition_note_size_unit_option({ unit: "characters" }) },
];
</script>

<template>
  <UiSegmentedControl
    v-model="unit"
    :options="unitOptions"
    :aria-label="m.decoration_condition_note_size_unit_label()"
  />
  <UiDropdown v-model="op" :aria-label="m.decoration_condition_op_label()">
    <option value="gt">{{ m.decoration_string_op_label({ op: "gt" }) }}</option>
    <option value="gte">{{ m.decoration_string_op_label({ op: "gte" }) }}</option>
    <option value="lt">{{ m.decoration_string_op_label({ op: "lt" }) }}</option>
    <option value="lte">{{ m.decoration_string_op_label({ op: "lte" }) }}</option>
  </UiDropdown>
  <UiNumberInput v-model="draft" :min="0" :aria-label="m.decoration_condition_note_size_value_label()" />
</template>
