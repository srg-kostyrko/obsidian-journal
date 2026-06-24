<script setup lang="ts">
import { match } from "ts-pattern";
import { useField } from "vee-validate";
import { computed, watch } from "vue";

import type { JournalDecorationPropertyCondition } from "@/decorations";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { MetadataTypeService } from "@/infrastructure/host";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

type ValueType = JournalDecorationPropertyCondition["valueType"];
type Op = JournalDecorationPropertyCondition["condition"];

const { name } = defineProps<{ name: string }>();

const metadataTypes = useService(MetadataTypeService);

const { value: propertyName } = useField<string>(`${name}.name`);
const { value: valueType, setValue: setValueType } = useField<ValueType>(`${name}.valueType`);
const { value: op, setValue: setOp } = useField<Op>(`${name}.condition`);
const { value: rawValue } = useField<string | number>(`${name}.value`);

const textModel = computed<string>({
  get: () => (typeof rawValue.value === "string" ? rawValue.value : ""),
  set: (next) => {
    rawValue.value = next;
  },
});

const numberModel = computed<number>({
  get: () => (typeof rawValue.value === "number" ? rawValue.value : 0),
  set: (next) => {
    rawValue.value = next;
  },
});

function obsidianTypeToValueType(obsidianType: string | null): ValueType {
  return match(obsidianType)
    .returnType<ValueType>()
    .with("number", () => "number")
    .with("checkbox", () => "checkbox")
    .with("date", "datetime", () => "date")
    .otherwise(() => "text");
}

const opsForType = computed<readonly Op[]>(() =>
  match(valueType.value)
    .returnType<readonly Op[]>()
    .with("text", () => [
      "exists",
      "does-not-exist",
      "eq",
      "neq",
      "contains",
      "does-not-contain",
      "starts-with",
      "ends-with",
    ])
    .with("number", () => ["exists", "does-not-exist", "eq", "neq", "lt", "lte", "gt", "gte"])
    .with("date", () => ["exists", "does-not-exist", "eq", "neq", "lt", "lte", "gt", "gte"])
    .with("checkbox", () => ["exists", "does-not-exist", "is-true", "is-false"])
    .exhaustive(),
);

type DateOp = Parameters<typeof m.decoration_date_op_label>[0]["op"];

// opsForType only yields date ops when the value type is date, so the cast is sound.
function opLabel(value: Op): string {
  return valueType.value === "date"
    ? m.decoration_date_op_label({ op: value as DateOp })
    : m.decoration_string_op_label({ op: value });
}

// The value type follows Obsidian's property registry (text fallback when the vault has not
// seen the property), so it re-derives as the user edits the name rather than being picked by hand.
watch(propertyName, (next) => {
  const detected = obsidianTypeToValueType(metadataTypes.getPropertyType(next));
  if (detected === valueType.value) return;
  setValueType(detected);
  setOp("exists");
  rawValue.value = detected === "number" ? 0 : "";
});
</script>

<template>
  <UiTextInput v-model="propertyName" />
  <UiDropdown v-model="op">
    <option v-for="o of opsForType" :key="o" :value="o">{{ opLabel(o) }}</option>
  </UiDropdown>
  <UiTextInput v-if="valueType === 'text'" v-model="textModel" />
  <UiNumberInput v-else-if="valueType === 'number'" v-model="numberModel" />
  <input v-else-if="valueType === 'date'" v-model="textModel" type="date" class="property-date-input" />
</template>
