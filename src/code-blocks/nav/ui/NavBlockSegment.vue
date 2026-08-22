<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, inject } from "vue";

import type { AnchorString } from "@/calendar";
import { useToday } from "@/calendar/ui";
import { CellDecoration, colorToString, useDecorationMenuItems } from "@/decorations";
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
  NotePathService,
  NumberingService,
  OpenDateFlow,
  useIndexVersion,
  type JournalConfig,
  type NavBlockSegment,
} from "@/journals";
import { ShelvesRepository } from "@/shelves";
import { TemplateEngine } from "@/templates";
import { useModifierHoverPreview } from "@/ui/use-modifier-hover-preview";

import { navSegmentFixedScope, navSegmentIntervalScope } from "../decoration-scopes";
import { resolveLinkCandidates, type LinkTarget } from "../link-targets";
import { buildNavRowContext } from "../nav-row-context";
import { resolveSegmentDecoration } from "../segment-decoration";
import { resolveSegmentLink } from "../segment-link";

const props = defineProps<{
  journal: JournalConfig;
  segment: NavBlockSegment;
  refDate: AnchorString;
  editable?: boolean;
  shelf?: string | null;
  // The editor's synthesized positional id ("<lineIndex>:<segmentIndex>"), read off the DOM
  // by the drag wiring in settings/ui — unused outside the editor.
  dragId?: string;
}>();

const emit = defineEmits<{ edit: [] }>();

const journals = useService(JournalsRepository);
const index = useService(JournalsIndex);
const cycle = useService(CycleService);
const numbering = useService(NumberingService);
const notePath = useService(NotePathService);
const shelves = useService(ShelvesRepository);
const engine = useService(TemplateEngine);
const flows = useService(Flows);
const workspace = useService(WorkspaceService);
const notices = useService(NoticeService);

const today = useToday();
const todayAnchor = computed(() => today.value.toAnchor());

const indexVersion = useIndexVersion();

const entry = computed(() => {
  void indexVersion.value;
  return index.entryByAnchor(props.journal.name, props.refDate);
});

const shelfJournals = computed<readonly JournalConfig[]>(() =>
  resolveLinkCandidates(props.journal.name, [...journals.find().list()], [...shelves.find().list()]),
);

const resolved = computed(() =>
  resolveSegmentLink(props.segment, props.journal, shelfJournals.value, entry.value, props.refDate),
);
const target = computed(() => resolved.value.target);
const linkAnchor = computed(() => resolved.value.date.toAnchor());

// A segment decorates from its own resolved link target rather than the block's period —
// see segment-decoration.ts for the fixed/interval scope split this depends on. This mirrors
// NavigationCodeBlock's own per-segment cell derivation exactly (same shared helper), so a
// period this segment can resolve to is always one the surrounding scope has registered.
const decorationCell = computed(() =>
  resolveSegmentDecoration(
    props.segment,
    props.journal,
    [...journals.find().list()],
    [...shelves.find().list()],
    entry.value,
    props.refDate,
    cycle,
  ),
);
const decorationScope = computed(() =>
  decorationCell.value?.scopeKind === "interval" ? navSegmentIntervalScope : navSegmentFixedScope,
);

// Both scopes are injected unconditionally at setup so the choice between them can stay a
// plain computed — inject() itself must run synchronously during setup, not lazily.
const fixedCells = inject(navSegmentFixedScope.map, null);
const intervalCells = inject(navSegmentIntervalScope.map, null);
const fixedDecorationItems = useDecorationMenuItems(fixedCells, () => props.shelf ?? null);
const intervalDecorationItems = useDecorationMenuItems(intervalCells, () => props.shelf ?? null);

// Offering to explain decorations this segment deliberately renders none of would be
// incoherent from the user's side, so the menu item tracks the same flag the template does.
function contextMenuItems(): readonly MenuItemSpec[] {
  if (!props.segment.addDecorations) return [];
  const cell = decorationCell.value;
  if (!cell) return [];
  // A custom journal's target IS the interval, and an interval is a "day"-kind period at its
  // start anchor — indistinguishable from the day cell without saying so here.
  return cell.scopeKind === "interval"
    ? intervalDecorationItems({
        kind: "interval",
        period: cell.period,
        journalName: cell.anchorJournalName,
      })
    : fixedDecorationItems({ kind: "fixed", period: cell.period });
}

const text = computed(() =>
  engine.renderString(
    props.segment.template,
    buildNavRowContext({
      journal: props.journal,
      refDate: props.refDate,
      entry: entry.value,
      cycle,
      numbering,
      notePath,
      today: todayAnchor.value,
    }),
  ),
);

const fontSize = computed(() => `${props.segment.fontSize}em`);
const fontWeight = computed(() => (props.segment.bold ? "bold" : "normal"));
const fontStyle = computed(() => (props.segment.italic ? "italic" : "normal"));
const color = computed(() => colorToString(props.segment.color));
const background = computed(() => colorToString(props.segment.background));
// In the editor the whole segment is the drag handle, so it shows the grab cursor rather than
// the link cursor its target would imply — dragging is the affordance a reader has no way to
// guess otherwise, and the note-opening cursor means nothing on a settings preview.
const cursor = computed(() => {
  if (props.editable) return "grab";
  return target.value.kind === "none" ? "default" : "pointer";
});

function pathsForTarget(t: LinkTarget): readonly VaultPath[] {
  return match(t)
    .with({ kind: "none" }, () => [])
    .with({ kind: "self" }, ({ path }) => [path])
    .with({ kind: "open" }, ({ journalNames }) => index.pathsAt(journalNames, linkAnchor.value))
    .exhaustive();
}

function onClick(event: MouseEvent): void {
  if (props.editable) {
    emit("edit");
    return;
  }
  const t = target.value;
  if (t.kind === "none") return;
  if (t.kind === "self") {
    // The sibling branch below reports its failures through the flow funnel; this one opens the
    // note directly, so it has to say so itself.
    void workspace.openNote(t.path, defineOpenMode(event)).tapErr(() => notices.show(m.common_note_open_error()));
    return;
  }
  void flows.invoke(OpenDateFlow, {
    anchor: linkAnchor.value,
    journalNames: [...t.journalNames],
    openMode: defineOpenMode(event),
    pickAt: event,
  });
}

function onContextMenu(event: MouseEvent): void {
  if (props.editable) return;
  workspace.openPathsMenu(pathsForTarget(target.value), event, contextMenuItems());
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.editable) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  emit("edit");
}

const hover = useModifierHoverPreview();

function onPointerEnter(event: PointerEvent): void {
  if (props.editable) return;
  hover.enter(event, (hoverEvent) => workspace.previewFirstPath(pathsForTarget(target.value), hoverEvent));
}
</script>

<template>
  <!-- The "nav-row" class name is a deliberate holdover: user CSS snippets and e2e selectors
       target it as a stable styling hook, even though the TypeScript vocabulary moved to
       "segment". ".nav-block-line" (in NavBlock.vue) changed meaning instead — it used to wrap
       a single row and now wraps a whole line of segments. -->
  <div
    class="nav-row"
    :class="{ 'nav-row--editable': editable }"
    :tabindex="editable ? 0 : undefined"
    :role="editable ? 'button' : undefined"
    :aria-label="editable && text.length === 0 ? m.block_lines_empty_segment() : undefined"
    :data-id="dragId"
    :data-drag-handle="editable ? '' : undefined"
    @click.prevent="onClick"
    @auxclick.middle.prevent="onClick"
    @contextmenu.prevent="onContextMenu"
    @pointerenter="onPointerEnter"
    @pointerleave="hover.leave()"
    @keydown="onKeydown"
  >
    <CellDecoration
      v-if="segment.addDecorations && decorationCell"
      :period="decorationCell.period"
      :scope="decorationScope"
    >
      {{ text }}
    </CellDecoration>
    <template v-else>{{ text }}</template>
    <span v-if="editable && text.length === 0" class="nav-segment-placeholder">—</span>
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
/* Nothing else tells a reader a segment can be dragged or clicked to edit: it is plain text in
   a preview. An outline rather than a border so revealing it reflows nothing, and the same
   treatment on keyboard focus since the segment is reachable by tab. */
.nav-row--editable:hover,
.nav-row--editable:focus-visible {
  outline: 1px dashed var(--text-faint);
  outline-offset: 2px;
  border-radius: var(--radius-s);
}
.nav-row--editable:active {
  cursor: grabbing;
}
.nav-segment-placeholder {
  color: var(--text-faint);
}
</style>
