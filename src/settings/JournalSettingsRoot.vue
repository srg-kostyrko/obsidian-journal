<script setup lang="ts">
import { ref } from "vue";
import JournalSettingsDashboard from "./JournalSettingsDashboard.vue";
import JournalSettingsEdit from "./JournalSettingsEdit.vue";

const selectedJournalId = ref<string | null>(null);
</script>

<template>
  <JournalSettingsEdit v-if="selectedJournalId" :journal-id="selectedJournalId" @back="selectedJournalId = null" />
  <JournalSettingsDashboard v-else @edit="selectedJournalId = $event" />
</template>
