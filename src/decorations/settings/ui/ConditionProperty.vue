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

const { value: propertyName, errorMessage: nameError } = useField<string>(`${name}.name`);
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

// Existence checks take no operand, so the value input is meaningless for them (v2 hid it too).
const showValueField = computed(() => op.value !== "exists" && op.value !== "does-not-exist");

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
  <UiTextInput v-model="propertyName" :aria-label="m.common_label_property_name()" />
  <UiDropdown v-model="op" :aria-label="m.decoration_condition_property_condition_label()">
    <option v-for="o of opsForType" :key="o" :value="o">{{ opLabel(o) }}</option>
  </UiDropdown>
  <template v-if="showValueField">
    <UiTextInput
      v-if="valueType === 'text'"
      v-model="textModel"
      :aria-label="m.decoration_condition_property_value_label()"
    />
    <UiNumberInput
      v-else-if="valueType === 'number'"
      v-model="numberModel"
      :aria-label="m.decoration_condition_property_value_label()"
    />
    <input
      v-else-if="valueType === 'date'"
      v-model="textModel"
      type="date"
      class="property-date-input"
      :aria-label="m.decoration_condition_property_value_label()"
    />
  </template>
  <span v-if="nameError" class="condition-property-error">{{ nameError }}</span>
</template>

<style scoped>
.condition-property-error {
  color: var(--text-error);
  flex-basis: 100%;
}
</style>
