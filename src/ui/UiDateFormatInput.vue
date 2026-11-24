<script setup lang="ts">
import { userDateFormat, type UserDateFormat } from "@/calendar";

import UiTextInput from "./UiTextInput.vue";

defineProps<{
  placeholder?: string;
  disabled?: boolean;
}>();

const model = defineModel<UserDateFormat>({ default: () => userDateFormat("") });
</script>

<template>
  <UiTextInput
    :model-value="model"
    :placeholder="placeholder"
    :disabled="disabled"
    @update:model-value="(next: string) => (model = userDateFormat(next))"
  />
</template>
