<script setup lang="ts">
import { ref } from "vue";

import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const props = defineProps<{
  currentShelf: string;
  shelfNames: string[];
}>();

const api = useModal<string>();
const selected = ref(props.currentShelf);
</script>

<template>
  <div>
    <UiSettingRow :name="m.common_label_shelf()">
      <UiDropdown v-model="selected">
        <option value="">{{ m.shelf_section_not_on_shelf() }}</option>
        <option v-for="shelf of props.shelfNames" :key="shelf" :value="shelf">{{ shelf }}</option>
      </UiDropdown>
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta @click="api.submit(selected)">{{ m.common_action_submit() }}</UiButton>
    </UiSettingRow>
  </div>
</template>
