<script setup lang="ts">
import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { DEFINED_NAVIGATION_TARGETS } from "../defined-navigation-targets";

import type { DefinedNavigationConfig, DefinedNavigationConfigChange } from "../defined-navigation-item";

const props = defineProps<{
  config: DefinedNavigationConfig;
  onChange: DefinedNavigationConfigChange;
}>();

const targets = DEFINED_NAVIGATION_TARGETS;

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
        {{ m.command_write_type_option({ writeType: target }) }}
      </option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_defined_navigation_previous() }}</template>
    <UiToggle
      :model-value="config.previous"
      @update:model-value="(value: boolean | undefined) => update({ previous: value ?? false })"
    />
  </UiSettingRow>
  <UiSettingRow>
    <template #name>{{ m.view_toolbar_defined_navigation_next() }}</template>
    <UiToggle
      :model-value="config.next"
      @update:model-value="(value: boolean | undefined) => update({ next: value ?? false })"
    />
  </UiSettingRow>
</template>
