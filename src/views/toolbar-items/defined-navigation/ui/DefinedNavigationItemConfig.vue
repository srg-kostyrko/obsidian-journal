<script setup lang="ts">
import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { DEFINED_NAVIGATION_TARGETS } from "../defined-navigation-targets";

import type { DefinedNavigationConfig, DefinedNavigationConfigChange } from "../defined-navigation-item";

const props = defineProps<{
  config: DefinedNavigationConfig;
  onChange: DefinedNavigationConfigChange;
}>();

const targets = DEFINED_NAVIGATION_TARGETS;
const directions = ["previous", "next"] as const;

const update = (patch: Partial<DefinedNavigationConfig>): void => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_defined_navigation_target() }}</template>
    <UiDropdown
      :model-value="config.target"
      @update:model-value="
        (value: string | undefined) => value && update({ target: value as DefinedNavigationConfig['target'] })
      "
    >
      <option v-for="target of targets" :key="target" :value="target">
        {{
          target === "active"
            ? m.view_toolbar_defined_navigation_target_active()
            : m.command_write_type_option({ writeType: target })
        }}
      </option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_defined_navigation_direction() }}</template>
    <UiDropdown
      :model-value="config.direction"
      @update:model-value="
        (value: string | undefined) => value && update({ direction: value as DefinedNavigationConfig['direction'] })
      "
    >
      <option v-for="direction of directions" :key="direction" :value="direction">
        {{ m.view_toolbar_defined_navigation_direction_option({ direction }) }}
      </option>
    </UiDropdown>
  </UiSettingRow>
</template>
