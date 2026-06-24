<script setup lang="ts">
import { useField } from "vee-validate";

import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

const { name } = defineProps<{ name: string }>();

const { value: op } = useField<"contains" | "starts-with" | "ends-with">(`${name}.condition`);
const { value: text } = useField<string>(`${name}.value`);
</script>

<template>
  <UiDropdown v-model="op">
    <option value="contains">{{ m.decoration_string_op_label({ op: "contains" }) }}</option>
    <option value="starts-with">{{ m.decoration_string_op_label({ op: "starts-with" }) }}</option>
    <option value="ends-with">{{ m.decoration_string_op_label({ op: "ends-with" }) }}</option>
  </UiDropdown>
  <UiTextInput v-model="text" />
</template>
