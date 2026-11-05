<script setup lang="ts">
import { ref } from "vue";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import { icons } from "@/ui/icons";
import { manual } from "@/ui/manual";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { appearanceSlice, UNCHANGED, type HighlightValues } from "../slice";

const settings = useService(SettingsService);
const slice = settings.getSlice(appearanceSlice);
const expanded = ref(false);

type Highlight = "today" | "selected" | "active";

function setHighlight(state: Highlight, values: Partial<HighlightValues>): void {
  const wide = slice.state.wide;
  slice.state = { ...slice.state, wide: { ...wide, [state]: { ...wide[state], ...values } } };
}
function setText(state: Highlight, color: ColorSettings): void {
  setHighlight(state, { text: { ...slice.state.wide[state].text, color } });
}
// Until the editor offers the style, a today background is how a user asks for a filled today,
// the same reading the v7 migration gives a stored one.
function setTodayBackground(color: ColorSettings): void {
  setHighlight("today", { color, style: color.type === "transparent" ? "text" : "background" });
}
// "Unchanged" has no picker option yet, so it shows as the stock color it renders as.
function textColor(state: Highlight): ColorSettings {
  const own = slice.state.wide[state].text.color;
  if (own !== UNCHANGED) return own;
  const stock = appearanceSlice.defaults.wide[state].text.color;
  return stock === UNCHANGED ? { type: "transparent" } : stock;
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded" :help="manual.view.calendars">
    <template #trigger>
      <UiIconedRow :icon="icons.section.appearance">{{ m.calendar_appearance_section_title() }}</UiIconedRow>
    </template>
    <UiSettingRow :name="m.calendar_appearance_today_text()">
      <template #description>{{ m.calendar_appearance_description({ target: "today", layer: "text" }) }}</template>
      <UiColorSettingsPicker
        :model-value="textColor('today')"
        role="text"
        @update:model-value="setText('today', $event)"
      />
    </UiSettingRow>
    <UiSettingRow :name="m.calendar_appearance_today_background()">
      <template #description>
        {{ m.calendar_appearance_description({ target: "today", layer: "background" }) }}
      </template>
      <UiColorSettingsPicker
        :model-value="slice.state.wide.today.color"
        role="background"
        @update:model-value="setTodayBackground"
      />
    </UiSettingRow>
    <UiSettingRow :name="m.calendar_appearance_active_text()">
      <template #description>{{ m.calendar_appearance_description({ target: "active", layer: "text" }) }}</template>
      <UiColorSettingsPicker
        :model-value="textColor('active')"
        role="text"
        @update:model-value="setText('active', $event)"
      />
    </UiSettingRow>
    <UiSettingRow :name="m.calendar_appearance_active_background()">
      <template #description>
        {{ m.calendar_appearance_description({ target: "active", layer: "background" }) }}
      </template>
      <UiColorSettingsPicker
        :model-value="slice.state.wide.active.color"
        role="background"
        @update:model-value="setHighlight('active', { color: $event })"
      />
    </UiSettingRow>
    <UiSettingRow :name="m.calendar_appearance_selected_ring()">
      <template #description>{{ m.calendar_appearance_selected_ring_description() }}</template>
      <UiColorSettingsPicker
        :model-value="slice.state.wide.selected.color"
        role="border"
        @update:model-value="setHighlight('selected', { color: $event })"
      />
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>
