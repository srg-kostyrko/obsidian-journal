<script setup lang="ts">
import { usePlugin } from "@/composables/use-plugin";
import ObsidianSetting from "./obsidian/ObsidianSetting.vue";
import { detectCurrentPreset, restoreLocale, updateLocale } from "@/calendar";
import { computed, watch } from "vue";
import ObsidianButton from "./obsidian/ObsidianButton.vue";
import CalendarWeekSettingsModal from "./modals/CalendarWeekSettings.modal.vue";
import { VueModal } from "./modals/vue-modal";
import ObsidianToggle from "../obsidian/components/ObsidianToggle.vue";

// https://en.wikipedia.org/wiki/Week#Other_week_numbering_systems

const plugin = usePlugin();

const currentPreset = computed(() => detectCurrentPreset(plugin.calendarSettings));

watch(
  () => plugin.calendarSettings.global,
  (global) => {
    if (global) {
      if (plugin.calendarSettings.dow === -1) {
        restoreLocale(true);
      } else {
        updateLocale(plugin.calendarSettings.dow, plugin.calendarSettings.doy, true);
      }
    } else {
      restoreLocale(true);
      if (plugin.calendarSettings.dow !== -1) {
        updateLocale(plugin.calendarSettings.dow, plugin.calendarSettings.doy, false);
      }
    }
  },
);

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
  <ObsidianSetting name="Apply week configuration for all dates in vault?">
    <template #description>
      <div>
        If disabled weak configuration settings are apply only to date within current journals and does not affect any
        dates created by other plugins or obsidian itself.
      </div>
      <div class="journal-hint">You might need to restart Obsidian for changes to take effect.</div>
    </template>
    <ObsidianToggle v-model="plugin.calendarSettings.global" />
  </ObsidianSetting>
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
.journal-hint {
  color: var(--text-warning);
}
</style>
