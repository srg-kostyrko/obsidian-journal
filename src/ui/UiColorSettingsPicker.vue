<script setup lang="ts" generic="M extends ColorSettings | 'unchanged'">
import { computed } from "vue";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";

import { themeColorGroupsFor, themeColorLabel, type ThemeColorFieldRole } from "./theme-colors";
import UiColorPicker from "./UiColorPicker.vue";
import UiDropdown from "./UiDropdown.vue";

const { role, unchanged = false } = defineProps<{ role: ThemeColorFieldRole; unchanged?: boolean }>();
// The literal mirrors UNCHANGED in notes-calendar/appearance; src/ui cannot import from there.
const model = defineModel<M>({ required: true });

// Widening the ref's type lets us write any member of the constraint without a cast; TS
// property variance is covariant, so this is how a generic model is written safely here.
const wide: { value: ColorSettings | "unchanged" } = model;
function write(next: ColorSettings | "unchanged") {
  wide.value = next;
}

const groups = computed(() => themeColorGroupsFor(role));
const offered = computed(() => new Set(groups.value.flatMap((group) => group.names)));

const kind = computed<ColorSettings["type"] | "unchanged">({
  get: () => (model.value === "unchanged" ? "unchanged" : model.value.type),
  set: (next) => {
    switch (next) {
      case "unchanged": {
        write("unchanged");
        break;
      }
      case "transparent": {
        write({ type: "transparent" });
        break;
      }
      case "theme": {
        write({ type: "theme", name: "" });
        break;
      }
      default: {
        write({ type: "custom", color: "#000000" });
      }
    }
  },
});

const themeName = computed<string>({
  get: () => (model.value !== "unchanged" && model.value.type === "theme" ? model.value.name : ""),
  set: (next) => {
    if (kind.value === "theme") write({ type: "theme", name: next });
  },
});

const customColor = computed<string>({
  get: () => (model.value !== "unchanged" && model.value.type === "custom" ? model.value.color : "#000000"),
  set: (next) => {
    if (kind.value === "custom") write({ type: "custom", color: next });
  },
});
</script>

<template>
  <span class="ui-color-settings-picker">
    <UiDropdown v-model="kind">
      <option v-if="unchanged" value="unchanged">{{ m.ui_color_kind_label({ kind: "unchanged" }) }}</option>
      <option value="transparent">{{ m.ui_color_kind_label({ kind: "transparent" }) }}</option>
      <option value="theme">{{ m.ui_color_kind_label({ kind: "theme" }) }}</option>
      <option value="custom">{{ m.ui_color_kind_label({ kind: "custom" }) }}</option>
    </UiDropdown>
    <template v-if="kind === 'theme'">
      <UiDropdown
        v-model="themeName"
        class="ui-color-settings-picker__theme"
        :aria-label="m.ui_color_theme_variable_label()"
      >
        <option value="">{{ m.ui_color_theme_variable_label() }}</option>
        <template v-if="groups.length > 1">
          <optgroup
            v-for="group of groups"
            :key="group.tag"
            :label="m.ui_theme_color_group_label({ group: group.tag })"
          >
            <option v-for="colorName of group.names" :key="colorName" :value="colorName">
              {{ themeColorLabel(colorName) }}
            </option>
          </optgroup>
        </template>
        <template v-else>
          <option v-for="colorName of groups[0]?.names ?? []" :key="colorName" :value="colorName">
            {{ themeColorLabel(colorName) }}
          </option>
        </template>
        <option v-if="themeName && !offered.has(themeName)" :value="themeName">
          {{ themeColorLabel(themeName) }}
        </option>
      </UiDropdown>
      <span
        v-if="themeName"
        class="ui-color-settings-picker__swatch"
        :style="{ backgroundColor: `var(--${themeName})` }"
      />
    </template>
    <UiColorPicker v-if="kind === 'custom'" v-model="customColor" />
  </span>
</template>

<style scoped>
.ui-color-settings-picker {
  display: inline-flex;
  gap: var(--size-2-2);
  align-items: center;
}
/* The longest theme-variable label ("Background modifier active hover") would otherwise
   set the select's intrinsic width and stretch the row. */
.ui-color-settings-picker__theme {
  max-inline-size: 12em;
  text-overflow: ellipsis;
}
.ui-color-settings-picker__swatch {
  inline-size: 28px;
  block-size: 28px;
  border-radius: 50%;
  border: 1px solid var(--background-modifier-border);
  flex-shrink: 0;
}
</style>
