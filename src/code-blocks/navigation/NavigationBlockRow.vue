<script setup lang="ts">
import { SHELF_DATA_KEY } from "@/constants";
import type { Journal } from "@/journals/journal";
import type { NavBlockRow } from "@/types/settings.types";
import { replaceTemplateVariables } from "@/utils/template";
import { computed, inject } from "vue";

const props = defineProps<{
  row: NavBlockRow;
  refDate: string;
  defaultFormat: string;
  journal: Journal;
}>();
const emit = defineEmits<(event: "navigate", type: string, date: string, journalName?: string) => void>();

const anchorDate = computed(() => {
  return props.journal.resolveAnchorDate(props.refDate);
});
const noteData = computed(() => props.journal.get(props.refDate));

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

const { journals } = inject(SHELF_DATA_KEY);

const isClickable = computed(() => {
  if (props.row.link === "none") return false;
  if (props.row.link === "self") return true;
  if (props.row.link === "journal") return Boolean(props.row.journal);
  return journals[props.row.link].value.length > 0;
});
const cursor = computed(() => (isClickable.value ? "pointer" : "default"));

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
