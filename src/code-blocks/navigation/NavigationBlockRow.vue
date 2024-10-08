<script setup lang="ts">
import type { Journal } from "@/journals/journal";
import type { JournalMetadata, JournalNoteData } from "@/types/journal.types";
import type { NavBlockRow } from "@/types/settings.types";
import { replaceTemplateVariables } from "@/utils/template";
import { computed, ref, watch } from "vue";

const props = defineProps<{
  row: NavBlockRow;
  refDate: string;
  defaultFormat: string;
  journal: Journal;
}>();
const emit = defineEmits<(e: "navigate", type: string, date: string, journalName?: string) => void>();

const anchorDate = computed(() => {
  return props.journal.resolveAnchorDate(props.refDate);
});
const noteData = ref<JournalNoteData | JournalMetadata | null>(null);
watch(anchorDate, async () => {
  noteData.value = await props.journal.find(props.refDate);
});

const text = computed(() => {
  return replaceTemplateVariables(props.row.template, {
    date: {
      type: "date",
      value: props.refDate,
      defaultFormat: props.defaultFormat,
    },
    start_date: {
      type: "date",
      value: anchorDate.value ? props.journal.resolveStartDate(anchorDate.value) : "",
      defaultFormat: props.defaultFormat,
    },
    end_date: {
      type: "date",
      value: anchorDate.value ? props.journal.resolveEndDate(anchorDate.value) : "",
      defaultFormat: props.defaultFormat,
    },
    relative_date: {
      type: "string",
      value: anchorDate.value ? props.journal.resolveRelativeDate(anchorDate.value) : "",
    },
    journal_name: {
      type: "string",
      value: props.journal.name,
    },
    index: {
      type: "string",
      value: noteData.value ? String(noteData.value.index) : "",
    },
  });
});
const fontSize = computed(() => `${props.row.fontSize}em`);
const fontWeight = computed(() => (props.row.bold ? "bold" : "normal"));
const fontStyle = computed(() => (props.row.italic ? "italic" : "normal"));
const cursor = computed(() => (props.row.link !== "none" ? "pointer" : "default"));

function onClick() {
  if (props.row.link === "none") return;
  if (props.row.link === "journal") {
    emit("navigate", "journal", props.refDate, props.journal.name);
  } else {
    emit("navigate", props.row.link, props.refDate);
  }
}
</script>

<template>
  <div v-if="anchorDate" class="row" @click.prevent="onClick">{{ text }}</div>
</template>

<style scoped>
.row {
  font-size: v-bind(fontSize);
  font-weight: v-bind(fontWeight);
  font-style: v-bind(fontStyle);
  cursor: v-bind(cursor);
}
</style>
