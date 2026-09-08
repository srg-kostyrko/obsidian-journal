<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { decorationsSlice } from "../slice";

import DecorationsSection from "./DecorationsSection.vue";

const slice = useService(SettingsService).getSlice(decorationsSlice);

// UiDropdown models a string; the slice stores a number, with 0 meaning unlimited.
const markLimit = computed<string>({
  get: () => String(slice.state.maxMarksPerSlot),
  set: (value) => {
    slice.state = { ...slice.state, maxMarksPerSlot: Number(value) };
  },
});
</script>

<template>
  <DecorationsSection :owner="{ kind: 'global' }">
    <template #settings>
      <UiSettingRow :name="m.decoration_mark_limit_label()">
        <template #description>{{ m.decoration_mark_limit_description() }}</template>
        <UiDropdown v-model="markLimit">
          <option value="0">{{ m.decoration_mark_limit_unlimited() }}</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
          <option value="6">6</option>
        </UiDropdown>
      </UiSettingRow>
    </template>
  </DecorationsSection>
</template>
