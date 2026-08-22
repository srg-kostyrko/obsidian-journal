<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { CalendarDate, Clock } from "@/calendar";
import { useToday } from "@/calendar/ui";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { NotesService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { TemplateContext, TemplateEngine } from "@/templates";
import UiMarkdown from "@/ui/UiMarkdown.vue";

import { useViewContext } from "../../../view-context";

import type { BlockInstanceId } from "../../../config";
import type { MarkdownTemplateConfig } from "../markdown-template-block";

const props = defineProps<{ instanceId: BlockInstanceId; config: MarkdownTemplateConfig }>();

const notes = useService(NotesService);
const engine = useService(TemplateEngine);
const viewContext = useViewContext();
const today = useToday();

const rawTemplate = ref<string | null>(null);
const readFailed = ref(false);

const hasPath = computed(() => props.config.templatePath.length > 0);

async function load(): Promise<void> {
  if (!hasPath.value) {
    rawTemplate.value = null;
    readFailed.value = false;
    return;
  }
  await notes.read(props.config.templatePath as VaultPath).match({
    ok: (content) => {
      rawTemplate.value = content;
      readFailed.value = false;
    },
    err: () => {
      rawTemplate.value = null;
      readFailed.value = true;
    },
  });
}

const rendered = computed(() => {
  if (rawTemplate.value === null) return "";
  const focus = CalendarDate.fromAnchor(viewContext.refDate.value);
  const clockSpec = { kind: "clock", value: Clock.now(), defaultFormat: "HH:mm" } as const;
  const context = TemplateContext.empty()
    .date("date", focus, "YYYY-MM-DD")
    .date("current_date", today.value, "YYYY-MM-DD", { invertible: false })
    .withSpec("time", clockSpec)
    .withSpec("current_time", clockSpec);
  return engine.renderString(rawTemplate.value, context);
});

const unsubscribes: (() => void)[] = [];

onMounted(() => {
  void load();
  const reloadIfMatch = (path: string): void => {
    if (path === props.config.templatePath) void load();
  };
  unsubscribes.push(
    notes.events.on("metadata-changed", reloadIfMatch),
    notes.events.on("created", (note) => reloadIfMatch(note.path)),
    notes.events.on("renamed", (event) => {
      if (event.to === props.config.templatePath || event.from === props.config.templatePath) void load();
    }),
    notes.events.on("deleted", reloadIfMatch),
  );
});

onUnmounted(() => {
  for (const unsubscribe of unsubscribes) unsubscribe();
  unsubscribes.length = 0;
});

watch(
  () => props.config.templatePath,
  () => void load(),
);
</script>

<template>
  <div class="journal-view-markdown-template">
    <div v-if="!hasPath" class="journal-view-markdown-template__empty">
      {{ m.view_block_markdown_template_empty() }}
    </div>
    <div v-else-if="readFailed" class="journal-view-markdown-template__error">
      {{ m.view_block_markdown_template_read_error() }}
    </div>
    <UiMarkdown v-else :markdown="rendered" :source-path="config.templatePath" />
  </div>
</template>
