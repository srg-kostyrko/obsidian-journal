<script setup lang="ts">
import type { Journal } from "@/journals/journal";
import type { NavBlockRow } from "@/types/settings.types";
import { replaceTemplateVariables } from "@/utils/template";
import { computed } from "vue";
import { useShelfData } from "@/composables/use-shelf";
import { colorToString } from "@/utils/color";
import { useDecorations } from "@/composables/use-decorations";
import { usePlugin } from "@/composables/use-plugin";
import CalendarDecoration from "@/components/notes-calendar/decorations/CalendarDecoration.vue";
import { isMetaPressed } from "@/utils/ui";

const { journal, refDate, defaultFormat, row } = defineProps<{
  row: NavBlockRow;
  refDate: string;
  defaultFormat: string;
  journal: Journal;
}>();
const emit =
  defineEmits<
    (
      event: "navigate" | "contextmenu" | "preview",
      type: NavBlockRow["link"],
      date: string,
      originalEvent: MouseEvent,
      journalName?: string,
    ) => void
  >();

const anchorDate = computed(() => {
  return journal.resolveAnchorDate(refDate);
});
const noteData = computed(() => journal.get(refDate));

const text = computed(() => {
  return replaceTemplateVariables(row.template, {
    date: {
      type: "date",
      value: refDate,
      defaultFormat: defaultFormat,
    },
    start_date: {
      type: "date",
      value: anchorDate.value ? journal.resolveStartDate(anchorDate.value) : "",
      defaultFormat: defaultFormat,
    },
    end_date: {
      type: "date",
      value: anchorDate.value ? journal.resolveEndDate(anchorDate.value) : "",
      defaultFormat: defaultFormat,
    },
    relative_date: {
      type: "string",
      value: anchorDate.value ? journal.resolveRelativeDate(anchorDate.value) : "",
    },
    journal_name: {
      type: "string",
      value: journal.name,
    },
    index: {
      type: "number",
      value: noteData.value?.index,
    },
  });
});
const fontSize = computed(() => `${row.fontSize}em`);
const fontWeight = computed(() => (row.bold ? "bold" : "normal"));
const fontStyle = computed(() => (row.italic ? "italic" : "normal"));
const color = computed(() => colorToString(row.color));
const background = computed(() => colorToString(row.background));

const plugin = usePlugin();
const { journals, decorations } = useShelfData();

const isClickable = computed(() => {
  if (row.link === "none") return false;
  if (row.link === "self") return true;
  if (row.link === "journal") return Boolean(row.journal);
  return journals[row.link].value.length > 0;
});
const cursor = computed(() => (isClickable.value ? "pointer" : "default"));

const decorationsStyles = useDecorations(plugin, anchorDate, decorations[journal.type]);

function onClick(event: MouseEvent) {
  if (row.link === "none") return;
  if (row.link === "journal") {
    emit("navigate", "journal", refDate, event, journal.name);
  } else {
    emit("navigate", row.link, refDate, event);
  }
}
function openContextMenu(event: MouseEvent) {
  if (row.link === "none") return;
  if (row.link === "journal") {
    emit("contextmenu", "journal", refDate, event, journal.name);
  } else {
    emit("contextmenu", row.link, refDate, event);
  }
}
function openPreview(event: PointerEvent) {
  if (!isMetaPressed(event)) return;
  if (row.link === "none") return;
  if (row.link === "journal") {
    emit("preview", "journal", refDate, event, journal.name);
  } else {
    emit("preview", row.link, refDate, event);
  }
}
</script>

<template>
  <div
    v-if="anchorDate"
    class="row"
    @click.prevent="onClick"
    @contextmenu="openContextMenu"
    @pointerenter="openPreview"
  >
    <CalendarDecoration v-if="row.addDecorations" :styles="decorationsStyles">{{ text }}</CalendarDecoration>
    <template v-else>
      {{ text }}
    </template>
  </div>
</template>

<style scoped>
.row {
  font-size: v-bind(fontSize);
  font-weight: v-bind(fontWeight);
  font-style: v-bind(fontStyle);
  cursor: v-bind(cursor);
  color: v-bind(color);
  background-color: v-bind(background);
  position: relative;
}
</style>
