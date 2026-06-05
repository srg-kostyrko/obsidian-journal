<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { NotePathService } from "@/journals";
import { TemplateEngine } from "@/templates";

import { renderForPreview } from "./render-for-preview";
import { useTodayMetadata } from "./use-today-metadata";
import { templateHasWrongWeek } from "./wrong-week";
import WrongWeekWarning from "./WrongWeekWarning.vue";

const props = defineProps<{ journalName: string; folder: string }>();

const pathSvc = useService(NotePathService);
const engine = useService(TemplateEngine);
const metadata = useTodayMetadata(props.journalName);

const resolved = computed(() => {
  if (!props.folder.includes("{")) return "";
  const md = metadata.value;
  if (!md) return "";
  const config = pathSvc.configFor(props.journalName);
  if (!config) return "";
  const context = pathSvc.contextFor(config, md);
  return renderForPreview(engine, props.folder, context);
});

const wrongWeek = computed(() => templateHasWrongWeek(props.folder));
</script>

<template>
  <div v-if="resolved">
    {{ m.journal_edit_folder_path_preview_label() }}
    <b class="u-pop">{{ resolved }}</b>
  </div>
  <WrongWeekWarning v-if="wrongWeek" />
</template>
