<script setup lang="ts">
import { useField } from "vee-validate";
import { computed, ref, watch } from "vue";

import { m } from "@/i18n";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSegmentedControl from "@/ui/UiSegmentedControl.vue";

const { name } = defineProps<{ name: string }>();
const { value: offset } = useField<number>(`${name}.offset`);

const day = ref<number | undefined>(Math.abs(offset.value) || 1);

// A day is only usable once it is a positive integer; the number input passes through
// negatives, decimals, and 0 untouched, and this predicate is the single gate for all of them.
const isValidDay = (next: number | undefined): next is number =>
  typeof next === "number" && Number.isSafeInteger(next) && next >= 1;

const side = computed<"start" | "end">({
  get: () => (offset.value < 0 ? "end" : "start"),
  set: (next) => {
    // Fall back to the stored magnitude so the direction still flips while the input is invalid.
    const magnitude = isValidDay(day.value) ? day.value : Math.abs(offset.value);
    offset.value = next === "end" ? -magnitude : magnitude;
  },
});

watch(offset, (next) => {
  const magnitude = Math.abs(next);
  if (magnitude >= 1) day.value = magnitude;
});

watch(day, (next) => {
  // Clearing the input yields a non-number; hold the last valid offset instead of coercing.
  if (!isValidDay(next)) return;
  offset.value = side.value === "end" ? -next : next;
});

const directionOptions = [
  { value: "start" as const, label: m.decoration_condition_offset_direction_option({ side: "start" }) },
  { value: "end" as const, label: m.decoration_condition_offset_direction_option({ side: "end" }) },
];

const hint = computed(() =>
  m.decoration_condition_offset_hint({
    side: offset.value < 0 ? "end" : "start",
    day: Math.abs(offset.value),
  }),
);
</script>

<template>
  <UiSegmentedControl
    v-model="side"
    :options="directionOptions"
    :aria-label="m.decoration_condition_offset_direction_label()"
  />
  <UiNumberInput v-model="day" :min="1" narrow :aria-label="m.decoration_condition_offset_day_label()" />
  <span class="offset-hint">{{ hint }}</span>
</template>

<style scoped>
.offset-hint {
  color: var(--text-muted);
}
</style>
