<script setup lang="ts">
import { ref } from "vue";

import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const props = defineProps<{
  shelfName: string;
  otherShelves: string[];
}>();

const api = useModal<string>();
const destination = ref("");
</script>

<template>
  <div>
    <UiSettingRow v-if="props.otherShelves.length > 0" :name="m.shelf_delete_modal_destination_label()">
      <template #description>{{ m.shelf_delete_modal_destination_description() }}</template>
      <UiDropdown v-model="destination">
        <option value="">{{ m.shelf_delete_modal_destination_none() }}</option>
        <option v-for="shelf of props.otherShelves" :key="shelf" :value="shelf">{{ shelf }}</option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow v-else>
      <template #description>{{ m.shelf_delete_modal_moved_out() }}</template>
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta warning @click="api.submit(destination)">
        {{ m.common_action_delete() }}
      </UiButton>
    </UiSettingRow>
  </div>
</template>
