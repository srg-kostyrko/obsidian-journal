<script setup lang="ts">
import { ref } from "vue";
import JournalSettingsDashboard from "./JournalSettingsDashboard.vue";
import JournalSettingsEdit from "./JournalSettingsEdit.vue";
import JournalSettingsShelfDetails from "./JournalSettingsShelfDetails.vue";
import BulkAddNotesModal from "@/components/modals/BulkAddNotes.modal.vue";
import { VueModal } from "@/components/modals/vue-modal";

const selectedJournalName = ref<string | null>(null);
const selectedShelfName = ref<string | null>(null);

function bulkAdd(journalName: string) {
  new VueModal(`Add notes to ${journalName}`, BulkAddNotesModal, { journalName }, 700).open();
}
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
    @bulk-add="bulkAdd($event)"
  />
  <JournalSettingsDashboard
    v-else
    @edit="selectedJournalName = $event"
    @organize="selectedShelfName = $event"
    @bulk-add="bulkAdd($event)"
  />
</template>
