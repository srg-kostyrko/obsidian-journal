<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type {
  BulkAddPrams,
  NodeProcessingOperationsWithDesisions,
  NoteDataForProcessing,
  NoteProcessingResult,
} from "./bulk-add-notes.types";
import { buildNotesList, preprocessNotes, processNote } from "./bulk-add-note-utils";
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
const currentNoteDesisions = computed(() => {
  if (!currentNote.value) return [];
  return currentNote.value.operations.filter(
    (op) =>
      (op.type === "existing_note" && op.desision === "ask") ||
      (op.type === "other_folder" && op.desision === "ask") ||
      (op.type === "other_name" && op.desision === "ask"),
  );
});
const processed = ref<NoteProcessingResult[]>([]);

const isPendingDecision = computed(() => currentNoteDesisions.value.length > 0);

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

function updateDesision(
  op: NodeProcessingOperationsWithDesisions,
  desision: NodeProcessingOperationsWithDesisions["desision"],
) {
  op.desision = desision;
  processCurrentNote().catch(console.error);
}

onMounted(() => {
  if (!journal.value) return;
  const list = buildNotesList(plugin, parameters.folder);
  stage.value = "Preprocesing notes...";
  notesQueue.value = preprocessNotes(plugin, journal.value, list, parameters);
  stage.value = "Processing notes...";
  scheduleNextNote().catch(console.error);
});
</script>

<template>
  <div v-if="currentNote && isPendingDecision">
    Note: {{ currentNote.file.basename }}<br />
    <div v-for="(op, index) of currentNoteDesisions" :key="index">
      <div v-if="op.type === 'existing_note'">
        Other note with same date existits in journal - {{ op.other_file.basename }}<br />
        <div>
          <ObsidianButton @click="updateDesision(op, 'skip')">Skip note</ObsidianButton>
          <ObsidianButton @click="updateDesision(op, 'override')">Override date connection</ObsidianButton>
          <ObsidianButton @click="updateDesision(op, 'merge')">Merge note content into existing one</ObsidianButton>
        </div>
      </div>
      <div v-else-if="op.type === 'other_folder'">
        Note is not in folder from journal setting<br />
        Configured folder: {{ op.configured_folder }}<br />
        Note folder: {{ currentNote.file.parent?.path }}<br />
        <div>
          <ObsidianButton @click="updateDesision(op, 'keep')">Keep as is</ObsidianButton>
          <ObsidianButton @click="updateDesision(op, 'move')">Move to configured folder</ObsidianButton>
        </div>
      </div>
      <div v-else-if="op.type === 'other_name'">
        Note name differs from journal settings<br />
        Configured name: {{ op.configured_name }}<br />
        Note name: {{ currentNote.file.basename }}<br />
        <div>
          <ObsidianButton @click="updateDesision(op, 'keep')">Keep as is</ObsidianButton>
          <ObsidianButton @click="updateDesision(op, 'rename')">Rename to configured name</ObsidianButton>
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
