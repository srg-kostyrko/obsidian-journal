<script setup lang="ts">
import { ref } from "vue";
import JournalSettingsDashboard from "./JournalSettingsDashboard.vue";
import JournalSettingsEdit from "./JournalSettingsEdit.vue";
import JournalSettingsShelfDetails from "./JournalSettingsShelfDetails.vue";

const selectedJournalName = ref<string | null>(null);
const selectedShelfName = ref<string | null>(null);
</script>

<template>
  <JournalSettingsEdit
    v-if="selectedJournalName"
    :journal-name="selectedJournalName"
    @back="selectedJournalName = null"
    @edit="selectedJournalName = $event"
  />
  <JournalSettingsShelfDetails
    v-else-if="selectedShelfName"
    :shelf-name="selectedShelfName"
    @back="selectedShelfName = null"
    @organize="selectedShelfName = $event"
    @edit="selectedJournalName = $event"
  />
  <JournalSettingsDashboard v-else @edit="selectedJournalName = $event" @organize="selectedShelfName = $event" />
</template>
