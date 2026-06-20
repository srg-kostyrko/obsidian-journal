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

const props = defineProps<{ journalName: string; path: string }>();

const pathSvc = useService(NotePathService);
const engine = useService(TemplateEngine);
const metadata = useTodayMetadata(props.journalName);

const resolved = computed(() => {
  if (!props.path.includes("{")) return "";
  const md = metadata.value;
  if (!md) return "";
  const config = pathSvc.configFor(props.journalName);
  if (!config) return "";
  const context = pathSvc.contextFor(config, md);
  return renderForPreview(engine, props.path, context);
});

const wrongWeek = computed(() => templateHasWrongWeek(props.path));
</script>

<template>
  <div v-if="resolved" class="template-path-preview">
    {{ m.journal_edit_template_path_preview_label() }}
    <b class="u-pop">{{ resolved }}</b>
  </div>
  <WrongWeekWarning v-if="wrongWeek" />
</template>

<style scoped>
.template-path-preview {
  padding: var(--size-2-2);
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
  line-height: var(--line-height-tight);
}
</style>
