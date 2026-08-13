<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, periodOfKind } from "@/calendar";
import type { Period } from "@/calendar";
import { CellDecoration, useCellDecorations, useDecorationMenuItems } from "@/decorations";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode, WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { OpenDateFlow } from "@/journals";
import { JournalsIndex } from "@/journals/journals-index";
import { ActiveEntryViewModel } from "@/notes-calendar/active-entry";
import { useCalendarAppearanceStyle } from "@/notes-calendar/appearance/use-appearance-style";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";
import UiButton from "@/ui/UiButton.vue";
import { useModifierHoverPreview } from "@/ui/use-modifier-hover-preview";

import { useViewContext } from "../../../view-context";

import type { BlockInstanceId } from "../../../config";
import type { PeriodButtonsConfig } from "../period-buttons-item";

type PeriodKey = "week" | "month" | "quarter" | "year";

interface Badge {
  readonly key: PeriodKey;
  readonly period: Period;
  readonly journals: readonly string[];
  readonly label: string;
  readonly navigable: boolean;
}

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: PeriodButtonsConfig;
}>();

const context = useViewContext();
const appearanceStyle = useCalendarAppearanceStyle();
const flows = useService(Flows);
const activeVM = useService(ActiveEntryViewModel);
const workspace = useService(WorkspaceService);
const index = useService(JournalsIndex);
const scope = useShelfScope(() => context.shelf.value);

const badges = computed<readonly Badge[]>(() => {
  const date = CalendarDate.fromAnchor(context.refDate.value);
  const out: Badge[] = [];
  const add = (key: PeriodKey, period: Period, journals: readonly string[], format: string): void => {
    const enabled = props.config[key];
    if (!enabled) return;
    // Only quarter self-hides when no journal of its kind exists; week/month/year stay visible
    // (but inert) so the toolbar layout does not shift.
    if (key === "quarter" && journals.length === 0) return;
    out.push({ key, period, journals, label: period.format(format), navigable: journals.length > 0 });
  };
  // The year button already carries the year, so the others omit it to avoid repeating it.
  add("week", periodOfKind("week", date), scope.week.value, "[W]ww");
  add("month", periodOfKind("month", date), scope.month.value, "MMMM");
  add("quarter", periodOfKind("quarter", date), scope.quarter.value, "[Q]Q");
  add("year", periodOfKind("year", date), scope.year.value, "YYYY");
  return out;
});

const cells = useCellDecorations({
  periods: () => badges.value.map((badge) => badge.period),
  journalNames: () => scope.fixed.value,
});
const decorationItems = useDecorationMenuItems(cells, () => context.shelf.value);

function isActive(badge: Badge): boolean {
  const active = activeVM.active.value;
  if (active === null) return false;
  if (!badge.journals.includes(active.journalName)) return false;
  return active.anchor === badge.period.anchor.toAnchor();
}

function open(badge: Badge, event: MouseEvent): void {
  if (!badge.navigable) return;
  void flows.invoke(OpenDateFlow, {
    anchor: badge.period.anchor.toAnchor(),
    journalNames: [...badge.journals],
    openMode: defineOpenMode(event),
    pickAt: event,
  });
}

function pathsFor(badge: Badge): readonly VaultPath[] {
  return index.pathsAt(badge.journals, badge.period.anchor.toAnchor());
}

// The badges mirror the in-grid header cells: right-click reaches the note's file
// menu and Ctrl/Cmd hover previews it.
function openContextMenu(badge: Badge, event: MouseEvent): void {
  workspace.openPathsMenu(pathsFor(badge), event, decorationItems({ kind: "fixed", period: badge.period }));
}

const hover = useModifierHoverPreview();

function openPreview(badge: Badge, event: MouseEvent): void {
  hover.enter(event, (hoverEvent) => workspace.previewFirstPath(pathsFor(badge), hoverEvent));
}
</script>

<template>
  <UiButton
    v-for="badge of badges"
    :key="badge.key"
    flat
    :style="appearanceStyle"
    :class="{ 'jv-period-inert': !badge.navigable }"
    :data-period="badge.key"
    :data-active="isActive(badge) || null"
    @click="(event: MouseEvent) => open(badge, event)"
    @auxclick.middle.prevent="(event: MouseEvent) => open(badge, event)"
    @contextmenu.prevent="(event: MouseEvent) => openContextMenu(badge, event)"
    @mouseenter="(event: MouseEvent) => openPreview(badge, event)"
    @mouseleave="hover.leave()"
  >
    <CellDecoration :period="badge.period">{{ badge.label }}</CellDecoration>
  </UiButton>
</template>

<style scoped>
/* A period with no journal of its kind stays visible but inert — not clickable, and no
   not-allowed cursor (it is not a disabled control, just nothing to open). Dimmed so it
   does not read as a clickable button. */
.jv-period-inert {
  pointer-events: none;
  opacity: 0.5;
}
/* Mirror the in-grid cell highlight: a period button whose note is the active one picks up
   the configured active colors (bound as CSS vars on the button itself, see appearanceStyle).
   The button[data-active] specificity clears the flat clickable-icon background. */
button[data-active] {
  color: var(--journal-cell-active-color);
  background-color: var(--journal-cell-active-bg);
}
</style>
