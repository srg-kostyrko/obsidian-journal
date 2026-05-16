<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, toRaw } from "vue";

import type { OpenInterval, Period } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";

import { datePickerModalDefinition } from "./date-picker-modal-definition";

import type { Picking } from "./errors";

const props = defineProps<{
  picking: Picking;
  bounds?: OpenInterval;
  placeholder?: string;
  disabled?: boolean;
}>();

const modelValue = defineModel<Period | null>();

const modalService = useService(ModalService);

function previewFor(picking: Picking): string {
  return match(picking)
    .with("day", () => "YYYY-MM-DD")
    .with("week", () => "YYYY-[W]w")
    .with("month", () => "YYYY-MM")
    .with("quarter", () => "YYYY-[Q]Q")
    .with("year", () => "YYYY")
    .exhaustive();
}

const label = computed<string>(() => {
  const value = toRaw(modelValue.value);
  if (!value) return props.placeholder ?? m.calendar_date_picker_title();
  return value.format(previewFor(props.picking));
});

async function open(): Promise<void> {
  const result = await modalService.open(datePickerModalDefinition, {
    picking: props.picking,
    bounds: props.bounds,
    selected: toRaw(modelValue.value) ?? null,
  });
  result.tap((period) => {
    modelValue.value = period;
  });
}
</script>

<template>
  <button type="button" class="date-picker-trigger" :disabled="disabled" @click="open">
    {{ label }}
  </button>
</template>
