<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

import { Calendar, calendarDisplaySlice, type WeekdayLabel } from "@/calendar";
import { useToday } from "@/calendar/ui/use-today";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import WrongWeekWarning from "@/journals/settings/ui/WrongWeekWarning.vue";
import { SettingsService } from "@/settings";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";

import { formatWeekday, weekFormatNeedsIsoWarning } from "../../cell-format";
import { defaultPattern, formatAt, withFormat } from "../appearance-editing";

import { controlLabel } from "./control-copy";

import type { FormatControl, FormatValue, Width } from "../appearance-parts";

const { control, width } = defineProps<{ control: FormatControl; width: Width }>();

const display = useService(SettingsService).getSlice(calendarDisplaySlice);
const calendar = useService(Calendar);
const today = useToday();

const label = computed(() => controlLabel(control));
const isWeekday = computed(() => control.label === "weekday");
const offersSameAsWide = computed(() => isWeekday.value && width === "narrow");

const stored = computed(() => formatAt(display.state, control, width));

function asWeekdayLabel(value: FormatValue): WeekdayLabel {
  return typeof value === "string" ? { type: "pattern", pattern: value } : value;
}

function sample(value: FormatValue | null): string {
  if (control.label !== "weekday") {
    const pattern = typeof value === "string" && value !== "" ? value : defaultPattern(control);
    return today.value.format(pattern);
  }
  return formatWeekday(today.value, value === null ? display.state.weekdayLabel : asWeekdayLabel(value));
}

const boxText = (value: FormatValue | null): string => (typeof value === "string" ? value : "");

const placeholder = computed(() => {
  const value = stored.value;
  if (value === null) return m.calendar_appearance_format_same_as_wide();
  if (typeof value !== "string") return m.calendar_appearance_format_letter();
  return defaultPattern(control);
});

// The box keeps what was typed: a typed default is stored as "", and echoing that back would
// empty the box under the cursor. It follows the store only when the store says something else.
const text = ref(boxText(stored.value));
watch(stored, (next) => {
  const typed = formatAt(withFormat(display.state, control, width, text.value), control, width);
  if (JSON.stringify(typed) !== JSON.stringify(next)) text.value = boxText(next);
});

function onType(next: string): void {
  text.value = next;
  display.state = withFormat(display.state, control, width, next);
}

const SAME_AS_WIDE = "same-as-wide";

const choices = computed(() => {
  const named = control.suggestions.map((value, index) => {
    const name = typeof value === "string" ? value : m.calendar_appearance_format_letter();
    return { key: String(index), text: `${name} — ${sample(value)}` };
  });
  return offersSameAsWide.value
    ? [...named, { key: SAME_AS_WIDE, text: m.calendar_appearance_format_same_as_wide() }]
    : named;
});

// The list snaps back to its title after a pick: the pick fills the box rather than staying selected.
const picked = ref("");
function onPick(key: string): void {
  picked.value = key;
  void nextTick(() => (picked.value = ""));
  const value = key === SAME_AS_WIDE ? null : control.suggestions[Number(key)];
  if (value === undefined) return;
  display.state = withFormat(display.state, control, width, value);
  text.value = boxText(stored.value);
}

const shown = computed(() => sample(stored.value));

const isoWarning = computed(
  () =>
    control.label === "week" &&
    weekFormatNeedsIsoWarning(typeof stored.value === "string" ? stored.value : "", calendar.isIsoWeekGrid()),
);
</script>

<template>
  <UiSettingRow class="appearance-control">
    <template #name>{{ label }}</template>
    <template #description>
      <div v-if="!isWeekday">{{ m.calendar_appearance_all_widths() }}</div>
      <div>
        <a target="_blank" href="https://momentjs.com/docs/#/displaying/format/">
          {{ m.common_moment_format_reference() }}
        </a>
      </div>
      <div>
        {{ m.calendar_appearance_format_preview() }}
        <b class="u-pop">{{ shown }}</b>
      </div>
      <WrongWeekWarning v-if="isoWarning" />
    </template>
    <UiTextInput :model-value="text" :placeholder="placeholder" :aria-label="label" @update:model-value="onType" />
    <UiDropdown
      :model-value="picked"
      :aria-label="m.calendar_appearance_format_suggestions()"
      @update:model-value="onPick"
    >
      <option value="" disabled>{{ m.calendar_appearance_format_suggestions() }}</option>
      <option v-for="choice of choices" :key="choice.key" :value="choice.key">{{ choice.text }}</option>
    </UiDropdown>
  </UiSettingRow>
</template>
