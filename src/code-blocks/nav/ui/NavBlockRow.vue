<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, inject } from "vue";

import { Clock, type AnchorString, type Period } from "@/calendar";
import {
  CellDecoration,
  CellDecorationMapKey,
  colorToString,
  useDecorationMenuItems,
  type CellDecorationScope,
} from "@/decorations";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import {
  defineOpenMode,
  NoticeService,
  WorkspaceService,
  type MenuItemSpec,
  type VaultPath,
} from "@/infrastructure/host";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  NumberingService,
  OpenDateFlow,
  useIndexVersion,
  type JournalConfig,
  type NavBlockRow,
} from "@/journals";
import { ShelvesRepository } from "@/shelves";
import { TemplateEngine } from "@/templates";
import { useModifierHoverPreview } from "@/ui/use-modifier-hover-preview";

import { resolveLinkCandidates, resolveLinkTarget, type LinkTarget } from "../link-targets";
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
  shelf?: string | null;
}>();

const journals = useService(JournalsRepository);
const index = useService(JournalsIndex);
const cycle = useService(CycleService);
const numbering = useService(NumberingService);
const shelves = useService(ShelvesRepository);
const engine = useService(TemplateEngine);
const flows = useService(Flows);
const workspace = useService(WorkspaceService);
const notices = useService(NoticeService);

const today = computed(() => Clock.now().format("YYYY-MM-DD") as AnchorString);

const indexVersion = useIndexVersion();

const entry = computed(() => {
  void indexVersion.value;
  return index.entryByAnchor(props.journal.name, props.refDate);
});

const shelfJournals = computed<readonly JournalConfig[]>(() =>
  resolveLinkCandidates(props.journal.name, [...journals.find().list()], [...shelves.find().list()]),
);

const target = computed(() => resolveLinkTarget(props.row, props.journal, shelfJournals.value, entry.value));

const decorationCells = inject(props.decorationScope?.map ?? CellDecorationMapKey, null);
const decorationItems = useDecorationMenuItems(decorationCells, () => props.shelf ?? null);

// Offering to explain decorations this row deliberately renders none of would be
// incoherent from the user's side, so the menu item tracks the same flag the template does.
function contextMenuItems(period: Period): readonly MenuItemSpec[] {
  if (!props.row.addDecorations) return [];
  // A custom journal's row IS the interval, and an interval is a "day"-kind period at its
  // start anchor — indistinguishable from the day cell without saying so here.
  return props.journal.write.type === "custom"
    ? decorationItems({ kind: "interval", period, journalName: props.journal.name })
    : decorationItems({ kind: "fixed", period });
}

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

function pathsForTarget(t: LinkTarget): readonly VaultPath[] {
  return match(t)
    .with({ kind: "none" }, () => [])
    .with({ kind: "self" }, ({ path }) => [path])
    .with({ kind: "open" }, ({ journalNames }) => index.pathsAt(journalNames, props.refDate))
    .exhaustive();
}

function onClick(event: MouseEvent): void {
  if (props.preventNavigation) return;
  const t = target.value;
  if (t.kind === "none") return;
  if (t.kind === "self") {
    // The sibling branch below reports its failures through the flow funnel; this one opens the
    // note directly, so it has to say so itself.
    void workspace.openNote(t.path, defineOpenMode(event)).tapErr(() => notices.show(m.common_note_open_error()));
    return;
  }
  void flows.invoke(OpenDateFlow, {
    anchor: props.refDate,
    journalNames: [...t.journalNames],
    openMode: defineOpenMode(event),
    pickAt: event,
  });
}

function onContextMenu(event: MouseEvent): void {
  if (props.preventNavigation) return;
  workspace.openPathsMenu(pathsForTarget(target.value), event, contextMenuItems(props.period));
}

const hover = useModifierHoverPreview();

function onPointerEnter(event: PointerEvent): void {
  if (props.preventNavigation) return;
  hover.enter(event, (hoverEvent) => workspace.previewFirstPath(pathsForTarget(target.value), hoverEvent));
}
</script>

<template>
  <div
    class="nav-row"
    @click.prevent="onClick"
    @auxclick.middle.prevent="onClick"
    @contextmenu.prevent="onContextMenu"
    @pointerenter="onPointerEnter"
    @pointerleave="hover.leave()"
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
