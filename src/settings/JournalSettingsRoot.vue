<script setup lang="ts">
import { ref } from "vue";
import JournalSettingsDashboard from "./JournalSettingsDashboard.vue";
import JournalSettingsEdit from "./JournalSettingsEdit.vue";

const selectedJournalName = ref<string | null>(null);
</script>

<template>
  <JournalSettingsEdit
    v-if="selectedJournalName"
    :journal-name="selectedJournalName"
    @back="selectedJournalName = null"
    @edit="selectedJournalName = $event"
  />
  <JournalSettingsDashboard v-else @edit="selectedJournalName = $event" />
</template>
