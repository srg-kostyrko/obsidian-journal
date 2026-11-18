<script setup lang="ts">
import { useField } from "vee-validate";
import { computed } from "vue";

import { m } from "@/i18n";
import UiSegmentedControl from "@/ui/UiSegmentedControl.vue";

const { name } = defineProps<{ name: string }>();

const { value: stored } = useField<"exists" | "missing" | undefined>(`${name}.presence`);

// A condition saved before presence existed carries no field; it means "exists".
const presence = computed({
  get: () => stored.value ?? "exists",
  set: (next) => {
    stored.value = next;
  },
});

const options = [
  { value: "exists" as const, label: m.decoration_condition_has_note_presence_option({ presence: "exists" }) },
  { value: "missing" as const, label: m.decoration_condition_has_note_presence_option({ presence: "missing" }) },
];
</script>

<template>
  <UiSegmentedControl
    v-model="presence"
    :options="options"
    :aria-label="m.decoration_condition_has_note_presence_label()"
  />
</template>
