<script setup lang="ts">
import { computed } from "vue";

import type { PeriodKind } from "@/calendar";
import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiIcon from "@/ui/UiIcon.vue";

const { direction, unit } = defineProps<{
  direction: "prev" | "next";
  unit: Exclude<PeriodKind, "day" | "decade">;
}>();

const emit = defineEmits<{ step: [steps: number] }>();

const back = computed(() => direction === "prev");
const tooltip = computed(() =>
  back.value
    ? m.view_toolbar_button_default_tooltip_prev_unit({ unit })
    : m.view_toolbar_button_default_tooltip_next_unit({ unit }),
);
</script>

<template>
  <UiButton flat :data-nav="direction" :tooltip @click="emit('step', back ? -1 : 1)">
    <UiIcon :name="back ? icons.nav.prev : icons.nav.next" />
  </UiButton>
</template>
