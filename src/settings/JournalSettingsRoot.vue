<script setup lang="ts">
import { computed, ref } from "vue";
import JournalSettingsDashboard from "./JournalSettingsDashboard.vue";
import JournalSettingsEdit from "./JournalSettingsEdit.vue";
import JournalSettingsShelfDetails from "./JournalSettingsShelfDetails.vue";
import BulkAddNotesModal from "@/components/modals/BulkAddNotes.modal.vue";
import { VueModal } from "@/components/modals/vue-modal";
import { useApp } from "@/composables/use-app";
import { usePlugin } from "@/composables/use-plugin";

const selectedJournalName = ref<string | null>(null);
const selectedShelfName = ref<string | null>(null);

const app = useApp();
const plugin = usePlugin();

const journal = computed(() => (selectedJournalName.value ? plugin.getJournal(selectedJournalName.value) : null));

function bulkAdd(journalName: string) {
  new VueModal(app, plugin, `Add notes to ${journalName}`, BulkAddNotesModal, { journalName }, 700).open();
}
</script>

<template>
  <JournalSettingsEdit
    v-if="journal"
    :journal="journal"
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
