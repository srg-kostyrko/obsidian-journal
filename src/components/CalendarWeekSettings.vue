<script setup lang="ts">
import { usePlugin } from "@/composables/use-plugin";
import ObsidianSetting from "./obsidian/ObsidianSetting.vue";
import { detectCurrentPreset } from "@/calendar";
import { computed } from "vue";
import ObsidianButton from "./obsidian/ObsidianButton.vue";
import CalendarWeekSettingsModal from "./modals/CalendarWeekSettings.modal.vue";
import { VueModal } from "./modals/vue-modal";

// https://en.wikipedia.org/wiki/Week#Other_week_numbering_systems

const plugin = usePlugin();

const currentPreset = computed(() => detectCurrentPreset(plugin.calendarSettings));

function change(): void {
  new VueModal(plugin, "Week configuration", CalendarWeekSettingsModal, {}).open();
}
</script>

<template>
  <ObsidianSetting heading name="Week configuration">
    <template #description>
      Here you can define what day of week should be used<br />
      as first and how first week of year should be defined<br />
      (influences week numbers).
    </template>
    <div class="column">
      <div class="whitespace">
        {{ currentPreset.description }}
      </div>
      <ObsidianButton class="self-end" @click="change">Change</ObsidianButton>
    </div>
  </ObsidianSetting>
  <ObsidianSetting name="Currently in use"> </ObsidianSetting>
</template>

<style scoped>
.whitespace {
  white-space: pre-wrap;
}
.column {
  display: flex;
  flex-direction: column;
}
.self-end {
  align-self: flex-end;
}
</style>
