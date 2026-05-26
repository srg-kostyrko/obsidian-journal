<script setup lang="ts">
import { useField } from "vee-validate";
import { computed } from "vue";

import type { JournalDecorationPropertyCondition } from "@/decorations";
import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

type ValueType = JournalDecorationPropertyCondition["valueType"];
type Op = JournalDecorationPropertyCondition["condition"];

const { name } = defineProps<{ name: string }>();

const { value: propertyName } = useField<string>(`${name}.name`);
const { value: valueType, setValue: setValueType } = useField<ValueType>(`${name}.valueType`);
const { value: op, setValue: setOp } = useField<Op>(`${name}.condition`);
const { value: text } = useField<string>(`${name}.value`);
const { value: numberValue } = useField<number>(`${name}.value`);

const opsForType = computed<readonly Op[]>(() => {
  if (valueType.value === "text") {
    return ["exists", "does-not-exist", "eq", "neq", "contains", "does-not-contain", "starts-with", "ends-with"];
  }
  if (valueType.value === "number") {
    return ["exists", "does-not-exist", "eq", "neq", "lt", "lte", "gt", "gte"];
  }
  return ["exists", "does-not-exist", "is-true", "is-false"];
});

function onValueTypeChange(next: ValueType): void {
  setValueType(next);
  setOp("exists");
  if (next === "number") numberValue.value = 0;
  else if (next === "text") text.value = "";
}
</script>

<template>
  <UiSettingRow :name="m.decoration_condition_property_name_label()">
    <UiTextInput v-model="propertyName" />
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_condition_property_value_type_label()">
    <UiDropdown :model-value="valueType" @update:model-value="onValueTypeChange($event as ValueType)">
      <option value="text">text</option>
      <option value="number">number</option>
      <option value="checkbox">checkbox</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.decoration_condition_property_condition_label()">
    <UiDropdown v-model="op">
      <option v-for="o of opsForType" :key="o" :value="o">{{ m.decoration_string_op_label({ op: o }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow v-if="valueType !== 'checkbox'" :name="m.decoration_condition_property_value_label()">
    <UiTextInput v-if="valueType === 'text'" v-model="text" />
    <UiNumberInput v-else v-model="numberValue" />
  </UiSettingRow>
</template>
