<script setup lang="ts">
import { useField } from "vee-validate";
import { computed, watch } from "vue";

import { m } from "@/i18n";
import UiSegmentedControl from "@/ui/UiSegmentedControl.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import StyleBorderSide from "./StyleBorderSide.vue";

import type { BorderSide, JournalDecorationBorder } from "../../config";
import type { BorderSideName } from "../../resolve-cell";

const { name, side } = defineProps<{ name: string; side: BorderSideName }>();
const { value: mode } = useField<JournalDecorationBorder["border"]>(`${name}.border`, undefined, {
  keepValueOnUnmount: true,
});
const { value: top } = useField<BorderSide>(`${name}.top`, undefined, { keepValueOnUnmount: true });
const { value: bottom } = useField<BorderSide>(`${name}.bottom`, undefined, { keepValueOnUnmount: true });
const { value: left } = useField<BorderSide>(`${name}.left`, undefined, { keepValueOnUnmount: true });
const { value: right } = useField<BorderSide>(`${name}.right`, undefined, { keepValueOnUnmount: true });

// Linked means one border around the cell, which is what the stored "uniform" mode already
// means — resolveCell copies `left` to all four sides. Keeping the four in step while linked
// makes switching to per side a no-op on the data.
//
// The watcher must not write `top`, which it also watches, or every edit re-triggers it. The
// "turn every side on" half of linking therefore lives in setMode, which runs once per click.
watch(
  [top, mode],
  () => {
    if (mode.value !== "uniform") return;
    bottom.value = { ...top.value };
    left.value = { ...top.value };
    right.value = { ...top.value };
  },
  { deep: true },
);

function setMode(next: JournalDecorationBorder["border"]): void {
  if (next === "uniform" && !top.value.show) top.value = { ...top.value, show: true };
  mode.value = next;
}

// UiSegmentedControl binds via plain v-model, but switching modes needs setMode's "turn `top`
// on when linking" side effect, so the model routes writes through it instead of `mode` directly.
const modeProxy = computed<JournalDecorationBorder["border"]>({
  get: () => mode.value,
  set: (next) => setMode(next),
});

const modeOptions = [
  { value: "uniform" as const, label: m.decoration_border_mode_label({ mode: "uniform" }) },
  { value: "different" as const, label: m.decoration_border_mode_label({ mode: "different" }) },
];
</script>

<template>
  <UiSettingRow :name="m.decoration_style_border_mode_label()">
    <UiSegmentedControl v-model="modeProxy" :options="modeOptions" />
  </UiSettingRow>
  <StyleBorderSide :name="`${name}.${mode === 'uniform' ? 'top' : side}`" />
</template>
