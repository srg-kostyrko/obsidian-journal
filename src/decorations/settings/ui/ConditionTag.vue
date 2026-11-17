<script setup lang="ts">
import { useField } from "vee-validate";

import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import ConditionNoteletScope from "./ConditionNoteletScope.vue";

const props = defineProps<{ name: string; journalName?: string; withNoteletScope?: boolean }>();

const { value: op } = useField<"contains" | "starts-with" | "ends-with">(`${props.name}.condition`);
const { value: text } = useField<string>(`${props.name}.value`);
</script>

<template>
  <UiDropdown v-model="op" :aria-label="m.decoration_condition_op_label()">
    <option value="contains">{{ m.decoration_string_op_label({ op: "contains" }) }}</option>
    <option value="starts-with">{{ m.decoration_string_op_label({ op: "starts-with" }) }}</option>
    <option value="ends-with">{{ m.decoration_string_op_label({ op: "ends-with" }) }}</option>
  </UiDropdown>
  <UiTextInput v-model="text" :aria-label="m.decoration_condition_tag_value_label()" />
  <ConditionNoteletScope v-if="props.withNoteletScope" :name="props.name" :journal-name="props.journalName" />
</template>
