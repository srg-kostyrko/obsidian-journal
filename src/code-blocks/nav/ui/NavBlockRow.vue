<script setup lang="ts">
import { Menu } from "obsidian";
import { computed } from "vue";

import { Clock, type AnchorString, type Period } from "@/calendar";
import { CellDecoration, colorToString, type CellDecorationScope } from "@/decorations";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode, WorkspaceService, type VaultPath } from "@/infrastructure/host";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  NumberingService,
  OpenDateFlow,
  type JournalConfig,
  type JournalEntry,
  type NavBlockRow,
} from "@/journals";
import { ShelvesRepository } from "@/shelves";
import { TemplateEngine } from "@/templates";

import { resolveLinkCandidates, resolveLinkTarget } from "../link-targets";
import { buildNavRowContext } from "../nav-row-context";

const props = defineProps<{
  journal: JournalConfig;
  row: NavBlockRow;
  refDate: AnchorString;
  period: Period;
  preventNavigation?: boolean;
  // Which provided decoration map a per-row decoration draws from. Omitted (the custom-interval
  // view) falls back to the default scope; the nav code block passes its per-row scope.
  decorationScope?: CellDecorationScope;
}>();

const journals = useService(JournalsRepository);
const index = useService(JournalsIndex);
const cycle = useService(CycleService);
const numbering = useService(NumberingService);
const shelves = useService(ShelvesRepository);
const engine = useService(TemplateEngine);
const flows = useService(Flows);
const workspace = useService(WorkspaceService);

const today = computed(() => Clock.now().format("YYYY-MM-DD") as AnchorString);

const entry = computed(() => index.entryByAnchor(props.journal.name, props.refDate));

const shelfJournals = computed<readonly JournalConfig[]>(() =>
  resolveLinkCandidates(props.journal.name, [...journals.find().list()], [...shelves.find().list()]),
);

const target = computed(() => resolveLinkTarget(props.row, props.journal, shelfJournals.value, entry.value));

const text = computed(() =>
  engine.renderString(
    props.row.template,
    buildNavRowContext({
      journal: props.journal,
      refDate: props.refDate,
      entry: entry.value,
      cycle,
      numbering,
      today: today.value,
    }),
  ),
);

const fontSize = computed(() => `${props.row.fontSize}em`);
const fontWeight = computed(() => (props.row.bold ? "bold" : "normal"));
const fontStyle = computed(() => (props.row.italic ? "italic" : "normal"));
const color = computed(() => colorToString(props.row.color));
const background = computed(() => colorToString(props.row.background));
const cursor = computed(() => (target.value.kind === "none" ? "default" : "pointer"));

function entriesForOpen(anchor: AnchorString, names: readonly string[]): readonly JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const name of names) {
    const opt = index.entryByAnchor(name, anchor);
    if (opt.isSome()) out.push(opt.value);
  }
  return out;
}

function onClick(event: MouseEvent): void {
  if (props.preventNavigation) return;
  const t = target.value;
  if (t.kind === "none") return;
  if (t.kind === "self") {
    void workspace.openNote(t.path, defineOpenMode(event));
    return;
  }
  void flows.invoke(OpenDateFlow, {
    anchor: props.refDate,
    journalNames: [...t.journalNames],
    openMode: defineOpenMode(event),
  });
}

function onContextMenu(event: MouseEvent): void {
  if (props.preventNavigation) return;
  const t = target.value;
  if (t.kind === "none") return;
  const paths: VaultPath[] =
    t.kind === "self" ? [t.path] : entriesForOpen(props.refDate, t.journalNames).map((entry) => entry.path);
  if (paths.length === 0) return;
  if (paths.length === 1) {
    const [first] = paths;
    if (first !== undefined) workspace.openFileMenu(first, event);
    return;
  }
  const menu = new Menu();
  for (const path of paths) {
    menu.addItem((item) => {
      item.setTitle(path).onClick(() => workspace.openFileMenu(path, event));
    });
  }
  menu.showAtMouseEvent(event);
}

function onPointerEnter(event: PointerEvent): void {
  if (props.preventNavigation) return;
  if (!event.ctrlKey && !event.metaKey) return;
  const t = target.value;
  if (t.kind === "none") return;
  const path = t.kind === "self" ? t.path : entriesForOpen(props.refDate, t.journalNames).map((entry) => entry.path)[0];
  if (path === undefined) return;
  workspace.triggerHoverPreview(path, event);
}
</script>

<template>
  <div
    class="nav-row"
    @click.prevent="onClick"
    @auxclick.middle.prevent="onClick"
    @contextmenu.prevent="onContextMenu"
    @pointerenter="onPointerEnter"
  >
    <CellDecoration v-if="row.addDecorations" :period="period" :scope="decorationScope">{{ text }}</CellDecoration>
    <template v-else>{{ text }}</template>
  </div>
</template>

<style scoped>
.nav-row {
  font-size: v-bind(fontSize);
  font-weight: v-bind(fontWeight);
  font-style: v-bind(fontStyle);
  color: v-bind(color);
  background-color: v-bind(background);
  cursor: v-bind(cursor);
  position: relative;
}
</style>
