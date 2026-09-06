<script setup lang="ts">
import { computed } from "vue";

import { useService } from "@/infrastructure/di";
import { TemplateEngine, type TemplateContext } from "@/templates";

import { NoteletPathService } from "../../notelets/notelet-path";
import { NotePathService } from "../../notes/note-path";

import { renderForPreview } from "./render-for-preview";
import { useTodayMetadata } from "./use-today-metadata";
import { templateHasWrongWeek } from "./wrong-week";
import WrongWeekWarning from "./WrongWeekWarning.vue";

import type { JournalConfig } from "../../config";
import type { TypeId } from "../../notelets/config";
import type { JournalMetadata } from "../../types";

const props = withDefaults(defineProps<{ journalName: string; value: string; label: string; typeId?: string }>(), {
  typeId: undefined,
});

const pathSvc = useService(NotePathService);
const noteletPaths = useService(NoteletPathService);
const engine = useService(TemplateEngine);
const metadata = useTodayMetadata(props.journalName);

// A type renders against its own context: the journal's has no {{notelet_index}}, and its
// prompt bindings are the period note's answers, which a type question may shadow by name.
function contextOf(config: JournalConfig, md: JournalMetadata): TemplateContext | undefined {
  if (props.typeId === undefined) return pathSvc.contextFor(config, md);
  const type = config.notelets[props.typeId];
  if (!type) return undefined;
  const context = noteletPaths.contextFor(config, type, {
    kind: "notelet",
    journalName: config.name,
    anchor: md.anchor,
    typeId: props.typeId as TypeId,
  });
  return context.isOk() ? context.value : undefined;
}

const resolved = computed(() => {
  if (!props.value.includes("{")) return "";
  const md = metadata.value;
  if (!md) return "";
  const config = pathSvc.configFor(props.journalName);
  if (!config) return "";
  const context = contextOf(config, md);
  if (!context) return "";
  return renderForPreview(engine, props.value, context);
});

const wrongWeek = computed(() => templateHasWrongWeek(props.value));
</script>

<template>
  <div v-if="resolved">
    {{ label }}
    <b class="u-pop">{{ resolved }}</b>
  </div>
  <WrongWeekWarning v-if="wrongWeek" />
</template>

<style scoped>
/* Preserve significant whitespace in a resolved value so spaces render literally. */
b {
  white-space: pre;
}
</style>
