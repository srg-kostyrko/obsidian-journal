<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type {
  BulkAddPrams,
  NodeProcessingOperationsWithDecisions,
  NoteDataForProcessing,
  NoteProcessingResult,
} from "./bulk-add-notes.types";
import { preprocessNotes, processNote } from "./bulk-add-note-utilities";
import { usePlugin } from "@/composables/use-plugin";
import ObsidianButton from "@/components/obsidian/ObsidianButton.vue";
import CollapsibleBlock from "@/components/CollapsibleBlock.vue";
import { delay } from "@/utils/misc";
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";

const { parameters, journalName } = defineProps<{
  journalName: string;
  parameters: BulkAddPrams;
}>();
defineEmits(["close"]);

const plugin = usePlugin();
const journal = computed(() => plugin.getJournal(journalName));
const stage = ref("Building list...");
const notesQueue = ref<NoteDataForProcessing[]>([]);

const currentNote = ref<NoteDataForProcessing | null>(null);
const currentNoteDecisions = computed(() => {
  if (!currentNote.value) return [];
  return currentNote.value.operations.filter(
    (op) =>
      (op.type === "existing_note" && op.decision === "ask") ||
      (op.type === "other_folder" && op.decision === "ask") ||
      (op.type === "other_name" && op.decision === "ask"),
  );
});
const currentNoteName = computed(() =>
  currentNote.value ? plugin.notesManager.getNoteName(currentNote.value.path) : "",
);
const currentNoteFolder = computed(() =>
  currentNote.value ? plugin.notesManager.getNoteFolder(currentNote.value.path) : "",
);
const processed = ref<NoteProcessingResult[]>([]);

const isPendingDecision = computed(() => currentNoteDecisions.value.length > 0);

async function scheduleNextNote() {
  await delay(10);
  if (notesQueue.value.length > 0) {
    currentNote.value = notesQueue.value.shift() ?? null;
    processCurrentNote().catch(console.error);
  } else {
    stage.value = "Finished";
  }
}

async function processCurrentNote() {
  if (!journal.value) return;
  if (!currentNote.value) return;
  if (isPendingDecision.value) return;
  const result = await processNote(plugin, journal.value, currentNote.value, parameters);

  processed.value.push(result);
  currentNote.value = null;
  scheduleNextNote().catch(console.error);
}

function updateDecision(
  op: NodeProcessingOperationsWithDecisions,
  decision: NodeProcessingOperationsWithDecisions["decision"],
) {
  op.decision = decision;
  processCurrentNote().catch(console.error);
}

onMounted(() => {
  if (!journal.value) return;
  const list = plugin.notesManager.getNotesInFolder(parameters.folder);
  stage.value = "Preprocessing notes...";
  notesQueue.value = preprocessNotes(plugin, journal.value, list, parameters);
  stage.value = "Processing notes...";
  scheduleNextNote().catch(console.error);
});
</script>

<template>
  <div v-if="currentNote && isPendingDecision">
    Note: {{ currentNoteName }}<br />
    <div v-for="(op, index) of currentNoteDecisions" :key="index">
      <div v-if="op.type === 'existing_note'">
        Other note with same date exists in journal - {{ plugin.notesManager.getNoteName(op.other_file) }}<br />
        <div>
          <ObsidianButton @click="updateDecision(op, 'skip')">Skip note</ObsidianButton>
          <ObsidianButton @click="updateDecision(op, 'override')">Override date connection</ObsidianButton>
          <ObsidianButton @click="updateDecision(op, 'merge')">Merge note content into existing one</ObsidianButton>
        </div>
      </div>
      <div v-else-if="op.type === 'other_folder'">
        Note is not in folder from journal setting<br />
        Configured folder: {{ op.configured_folder }}<br />
        Note folder: {{ currentNoteFolder }}<br />
        <div>
          <ObsidianButton @click="updateDecision(op, 'keep')">Keep as is</ObsidianButton>
          <ObsidianButton @click="updateDecision(op, 'move')">Move to configured folder</ObsidianButton>
        </div>
      </div>
      <div v-else-if="op.type === 'other_name'">
        Note name differs from journal settings<br />
        Configured name: {{ op.configured_name }}<br />
        Note name: {{ currentNoteName }}<br />
        <div>
          <ObsidianButton @click="updateDecision(op, 'keep')">Keep as is</ObsidianButton>
          <ObsidianButton @click="updateDecision(op, 'rename')">Rename to configured name</ObsidianButton>
        </div>
      </div>
    </div>
  </div>
  <div v-else>{{ stage }}</div>

  <CollapsibleBlock v-if="processed.length > 0">
    <template #trigger>
      Processed notes {{ parameters.dry_run ? "(dry run)" : "" }}
      <span class="flair">{{ processed.length }}</span>
    </template>

    <div v-for="entry of processed" :key="entry.path" class="log-entry">
      {{ entry.path }}<br />
      <ul>
        <li v-for="line of entry.actions" :key="line">{{ line }}</li>
      </ul>
    </div>
  </CollapsibleBlock>
  <ObsidianSetting v-if="stage === 'Finished'">
    <ObsidianButton @click="$emit('close')">Close</ObsidianButton>
  </ObsidianSetting>
</template>

<style scoped>
.log-entry {
  padding: 4px 0;
}
</style>
