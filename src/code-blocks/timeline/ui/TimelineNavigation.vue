<script setup lang="ts">
import { computed } from "vue";

import type { Period, PeriodKind } from "@/calendar";
import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiIcon from "@/ui/UiIcon.vue";

import { navigationLabel } from "../navigation-label";

const props = defineProps<{
  periods: readonly Period[];
  unit: Exclude<PeriodKind, "day" | "decade">;
  moved: boolean;
}>();

const emit = defineEmits<{ step: [steps: number]; reset: [] }>();

const label = computed(() => navigationLabel(props.periods));
</script>

<template>
  <div class="timeline-navigation">
    <UiButton
      flat
      data-nav="prev"
      :tooltip="m.view_toolbar_button_default_tooltip_prev_unit({ unit })"
      @click="emit('step', -1)"
    >
      <UiIcon :name="icons.nav.prev" />
    </UiButton>
    <span class="timeline-navigation__middle">
      <span class="timeline-navigation__label">{{ label }}</span>
      <!-- The slot keeps its width whether or not the button is in it, so the label does not
           shift sideways the moment the block is paged away from its note. -->
      <span class="timeline-navigation__reset-slot">
        <UiButton
          v-if="moved"
          flat
          data-nav="reset"
          :tooltip="m.relative_date_this({ period: unit })"
          @click="emit('reset')"
        >
          <UiIcon :name="icons.action.reset" />
        </UiButton>
      </span>
    </span>
    <UiButton
      flat
      data-nav="next"
      :tooltip="m.view_toolbar_button_default_tooltip_next_unit({ unit })"
      @click="emit('step', 1)"
    >
      <UiIcon :name="icons.nav.next" />
    </UiButton>
  </div>
</template>

<style scoped>
.timeline-navigation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-2-2);
}
.timeline-navigation__middle {
  display: flex;
  align-items: center;
  gap: var(--size-2-2);
}
.timeline-navigation__label {
  font-size: var(--font-ui-smaller);
  color: var(--text-muted);
  white-space: nowrap;
}
.timeline-navigation__reset-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--size-4-5);
}
</style>
