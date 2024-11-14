<script setup lang="ts">
import { ref } from "vue";
import type { BulkAddPrams } from "./bulk-add-notes/bulk-add-notes.types";
import ConfigureBulkAddNotes from "./bulk-add-notes/ConfigureBulkAddNotes.vue";
import BulkProcessNotes from "./bulk-add-notes/BulkProcessNotes.vue";

defineProps<{
  journalName: string;
}>();
defineEmits(["close"]);
const processingParameters = ref<BulkAddPrams>();

function startProcessing(parameters: BulkAddPrams) {
  processingParameters.value = parameters;
}
</script>

<template>
  <BulkProcessNotes
    v-if="processingParameters"
    :journal-name="journalName"
    :parameters="processingParameters"
    @close="$emit('close')"
  />
  <ConfigureBulkAddNotes v-else :journal-name="journalName" @process="startProcessing" @close="$emit('close')" />
</template>

<style scoped></style>
