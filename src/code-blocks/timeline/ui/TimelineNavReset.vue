<script setup lang="ts">
import type { PeriodKind } from "@/calendar";
import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiIcon from "@/ui/UiIcon.vue";

const {
  unit,
  moved = false,
  mirror = false,
} = defineProps<{
  unit: Exclude<PeriodKind, "day" | "decade">;
  moved?: boolean;
  // The instance on the opposite side of the row, holding the same width open so what sits
  // between the two stays centred rather than shifting by half a button.
  mirror?: boolean;
}>();

const emit = defineEmits<{ reset: [] }>();
</script>

<template>
  <span class="timeline-nav-reset" :aria-hidden="mirror || undefined">
    <UiButton
      v-if="moved && !mirror"
      flat
      data-nav="reset"
      :tooltip="m.relative_date_this({ period: unit })"
      @click="emit('reset')"
    >
      <UiIcon :name="icons.action.reset" />
    </UiButton>
  </span>
</template>

<style scoped>
/* Keeps its width whether or not the button is in it, so what sits beside it does not jump
   sideways the moment the block is paged away. */
.timeline-nav-reset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--size-4-5);
}
</style>
