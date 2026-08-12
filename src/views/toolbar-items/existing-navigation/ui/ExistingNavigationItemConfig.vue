<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import ToolbarAppearanceRows from "../../ui/ToolbarAppearanceRows.vue";
import {
  resolveExistingNavigationAppearance,
  type ExistingNavigationConfig,
  type ExistingNavigationConfigChange,
} from "../existing-navigation-config";
import { EXISTING_NAVIGATION_TARGETS } from "../existing-navigation-targets";

const props = defineProps<{
  config: ExistingNavigationConfig;
  onChange: ExistingNavigationConfigChange;
}>();

const targets = EXISTING_NAVIGATION_TARGETS;
const directions = ["previous", "next"] as const;

const appearance = computed(() => resolveExistingNavigationAppearance(props.config));

const update = (patch: Partial<ExistingNavigationConfig>): void => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <ToolbarAppearanceRows :value="config" :appearance="appearance" :on-change="update" />
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_existing_navigation_target() }}</template>
    <UiDropdown
      :model-value="config.target"
      @update:model-value="
        (value: string | undefined) => value && update({ target: value as ExistingNavigationConfig['target'] })
      "
    >
      <option v-for="target of targets" :key="target" :value="target">
        {{
          target === "active"
            ? m.view_toolbar_existing_navigation_target_active()
            : m.command_write_type_option({
                writeType: target,
              })
        }}
      </option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_existing_navigation_direction() }}</template>
    <UiDropdown
      :model-value="config.direction"
      @update:model-value="
        (value: string | undefined) => value && update({ direction: value as ExistingNavigationConfig['direction'] })
      "
    >
      <option v-for="direction of directions" :key="direction" :value="direction">
        {{ m.view_toolbar_existing_navigation_direction_option({ direction }) }}
      </option>
    </UiDropdown>
  </UiSettingRow>
</template>
