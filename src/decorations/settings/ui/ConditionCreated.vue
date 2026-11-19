<script setup lang="ts">
import { useField } from "vee-validate";
import { ref, watch } from "vue";

import { m } from "@/i18n";
import UiNumberInput from "@/ui/UiNumberInput.vue";

const { name } = defineProps<{ name: string }>();

const { value: atLeast } = useField<number>(`${name}.atLeast`);

const draft = ref<number | undefined>(atLeast.value);

// Clearing the input yields a non-number, which the schema rejects — and the modal
// shows no errors and does not gate Save on validity, so an invalid field would make
// Save silently do nothing. Hold the last valid count instead.
const isValidCount = (next: number | undefined): next is number =>
  typeof next === "number" && Number.isSafeInteger(next) && next >= 1;

watch(atLeast, (next) => {
  if (isValidCount(next)) draft.value = next;
});

watch(draft, (next) => {
  if (!isValidCount(next)) return;
  atLeast.value = next;
});
</script>

<template>
  <UiNumberInput v-model="draft" :min="1" :aria-label="m.decoration_condition_created_value_label()" />
</template>
