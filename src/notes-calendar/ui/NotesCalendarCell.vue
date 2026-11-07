<script setup lang="ts">
import { computed, toRaw } from "vue";

import type { Period } from "@/calendar";
import { useToday } from "@/calendar/ui";
import { CellDecoration } from "@/decorations";
import { useModifierHoverPreview } from "@/ui/use-modifier-hover-preview";

import { accessibleFormatPattern, defaultFormatPattern } from "../cell-format";

import type { NotesCellApi } from "../use-notes-cell";

const props = defineProps<{
  period: Period;
  cell: NotesCellApi;
  format?: string;
  role?: "gridcell" | "rowheader";
  tabIndex?: number;
  selected?: boolean;
  outside?: boolean;
  disabled?: boolean;
  weekend?: boolean;
  currentWeek?: boolean;
}>();

const rawPeriod = computed(() => toRaw(props.period));
const pattern = computed(() => props.format ?? defaultFormatPattern(rawPeriod.value.kind));
const label = computed(() => rawPeriod.value.format(pattern.value));
const isActive = computed(() => props.cell.isActive(rawPeriod.value));
const isInactive = computed(() => !props.cell.isActionable(rawPeriod.value));
const isControl = computed(() => props.role !== undefined || !isInactive.value);
const resolvedRole = computed(() => props.role ?? (isControl.value ? "button" : undefined));
// A disabled cell keeps its grid role, so the columns still line up for a screen reader, but takes no tab stop.
const resolvedTabIndex = computed(() =>
  props.disabled ? undefined : (props.tabIndex ?? (isControl.value ? 0 : undefined)),
);
const today = useToday();
const isToday = computed(() => rawPeriod.value.kind === "day" && rawPeriod.value.contains(today.value));
const states = computed(() =>
  (
    [
      ["outside", props.outside],
      ["today", isToday.value],
      ["selected", props.selected],
      ["active", isActive.value],
    ] as const
  )
    .filter(([, applies]) => applies)
    .map(([state]) => state),
);
// The open note's fill replaces today's, as it did before layers existed; today's ring stays.
const fills = computed(() => states.value.filter((state) => state !== "today" || !isActive.value));
const accessibleName = computed(() =>
  isControl.value ? rawPeriod.value.format(accessibleFormatPattern(rawPeriod.value.kind)) : undefined,
);
// A non-control cell takes no aria-label, so its text is what is read; a custom format would change that
// text, and the accessible name must not follow the user's format.
const hiddenName = computed(() =>
  isControl.value || pattern.value === defaultFormatPattern(rawPeriod.value.kind)
    ? undefined
    : rawPeriod.value.format(accessibleFormatPattern(rawPeriod.value.kind)),
);

const hover = useModifierHoverPreview();
</script>

<template>
  <span
    class="notes-calendar-cell"
    :role="resolvedRole"
    :tabindex="resolvedTabIndex"
    :aria-label="accessibleName"
    :aria-selected="selected || undefined"
    :aria-disabled="disabled || undefined"
    :data-active="isActive || null"
    :data-inactive="isInactive || null"
    :data-anchor="rawPeriod.anchor.toAnchor()"
    :data-kind="rawPeriod.kind"
    :data-today="isToday || null"
    :data-selected="selected || null"
    :data-outside="outside || null"
    :data-weekend="weekend || null"
    :data-current-week="currentWeek || null"
    @click="cell.open(rawPeriod, $event)"
    @auxclick.middle.prevent="cell.open(rawPeriod, $event)"
    @keydown.enter="cell.open(rawPeriod, $event)"
    @keydown.space.prevent="cell.open(rawPeriod, $event)"
    @contextmenu.prevent="cell.openContextMenu(rawPeriod, $event)"
    @mouseenter="hover.enter($event, (event) => cell.openPreview(rawPeriod, event))"
    @mouseleave="hover.leave()"
  >
    <!-- Every fill before every ring, so no state's fill can hide another state's ring. -->
    <span
      v-for="state in fills"
      :key="`${state}-fill`"
      class="notes-calendar-cell__layer"
      :data-layer="`${state}-fill`"
      aria-hidden="true"
    />
    <span
      v-for="state in states"
      :key="`${state}-ring`"
      class="notes-calendar-cell__layer"
      :data-layer="`${state}-ring`"
      aria-hidden="true"
    />
    <span class="notes-calendar-cell__text">
      <CellDecoration :period="rawPeriod">
        <template v-if="hiddenName === undefined">{{ label }}</template>
        <span v-else aria-hidden="true">{{ label }}</span>
      </CellDecoration>
    </span>
    <span v-if="hiddenName !== undefined" class="notes-calendar-cell__accessible-name">{{ hiddenName }}</span>
  </span>
</template>

<style scoped>
/* Actionable cells open a note on click; inactive (non-actionable) cells offer nothing — they
   keep the plain cursor rather than not-allowed, since they are decoration, not disabled
   controls (same reasoning as the inert period buttons in the toolbar). */
.notes-calendar-cell {
  cursor: pointer;
  /* Height would otherwise come entirely from the decorations' shared padding, so a vault with no
     journals — or one whose decorations are colour-only and reserve no padding — collapses every
     row to a bare text line. 26px is a floor, not a fixed row, so taller decorations still grow
     it. The cell is flex so the decoration stretches to fill that floor instead of resolving its
     height: 100% against a parent that has only a min-height. */
  display: flex;
  position: relative;
  isolation: isolate;
  min-height: var(--_v-cell-min-height);
  border-radius: var(--_v-cell-radius);
}
/* Every catalog value the cell reads, resolved once here and re-resolved by the narrow query below.
   A value with no stock has no innermost fallback at either width, so unset it stays
   guaranteed-invalid and the precedence chains fall through it. */
.notes-calendar-cell {
  --_v-cell-padding: var(--journal-cell-cell-padding, var(--journal-saved-cell-cell-padding, 0px));
  --_v-cell-radius: var(--journal-cell-cell-radius, var(--journal-saved-cell-cell-radius, var(--radius-s)));
  --_v-cell-min-height: var(
    --journal-cell-cell-min-height,
    var(--journal-saved-cell-cell-min-height, clamp(26px, 7cqi, 64px))
  );
  --_v-outside-color: var(--journal-cell-outside-color, var(--journal-saved-cell-outside-color, transparent));
  --_v-outside-ring-width: var(--journal-cell-outside-ring-width, var(--journal-saved-cell-outside-ring-width, 0px));
  --_v-outside-strength: var(--journal-cell-outside-strength, var(--journal-saved-cell-outside-strength, 0));
  --_v-outside-text-color: var(
    --journal-cell-outside-text-color,
    var(--journal-saved-cell-outside-text-color, var(--text-muted))
  );
  --_v-outside-text-weight: var(--journal-cell-outside-text-weight, var(--journal-saved-cell-outside-text-weight));
  --_v-outside-text-italic: var(--journal-cell-outside-text-italic, var(--journal-saved-cell-outside-text-italic));
  --_v-outside-layer: var(--journal-cell-outside-layer, var(--journal-saved-cell-outside-layer, -1));
  --_v-today-color: var(--journal-cell-today-color, var(--journal-saved-cell-today-color, transparent));
  --_v-today-ring-width: var(--journal-cell-today-ring-width, var(--journal-saved-cell-today-ring-width, 0px));
  --_v-today-strength: var(--journal-cell-today-strength, var(--journal-saved-cell-today-strength, 0));
  --_v-today-text-color: var(
    --journal-cell-today-text-color,
    var(--journal-saved-cell-today-text-color, var(--text-accent))
  );
  --_v-today-text-weight: var(--journal-cell-today-text-weight, var(--journal-saved-cell-today-text-weight));
  --_v-today-text-italic: var(--journal-cell-today-text-italic, var(--journal-saved-cell-today-text-italic));
  --_v-today-layer: var(--journal-cell-today-layer, var(--journal-saved-cell-today-layer, -1));
  --_v-selected-color: var(
    --journal-cell-selected-color,
    var(--journal-saved-cell-selected-color, var(--interactive-accent))
  );
  --_v-selected-ring-width: var(--journal-cell-selected-ring-width, var(--journal-saved-cell-selected-ring-width, 2px));
  --_v-selected-strength: var(--journal-cell-selected-strength, var(--journal-saved-cell-selected-strength, 0));
  --_v-selected-text-color: var(--journal-cell-selected-text-color, var(--journal-saved-cell-selected-text-color));
  --_v-selected-text-weight: var(--journal-cell-selected-text-weight, var(--journal-saved-cell-selected-text-weight));
  --_v-selected-text-italic: var(--journal-cell-selected-text-italic, var(--journal-saved-cell-selected-text-italic));
  --_v-selected-layer: var(--journal-cell-selected-layer, var(--journal-saved-cell-selected-layer, 1));
  --_v-active-color: var(
    --journal-cell-active-color,
    var(--journal-saved-cell-active-color, var(--interactive-accent))
  );
  --_v-active-ring-width: var(--journal-cell-active-ring-width, var(--journal-saved-cell-active-ring-width, 0px));
  --_v-active-strength: var(--journal-cell-active-strength, var(--journal-saved-cell-active-strength, 1));
  --_v-active-text-color: var(
    --journal-cell-active-text-color,
    var(--journal-saved-cell-active-text-color, var(--text-on-accent))
  );
  --_v-active-text-weight: var(--journal-cell-active-text-weight, var(--journal-saved-cell-active-text-weight));
  --_v-active-text-italic: var(--journal-cell-active-text-italic, var(--journal-saved-cell-active-text-italic));
  --_v-active-layer: var(--journal-cell-active-layer, var(--journal-saved-cell-active-layer, -1));
  --_v-current-week-text-color: var(
    --journal-cell-current-week-text-color,
    var(--journal-saved-cell-current-week-text-color)
  );
  --_v-current-week-text-weight: var(
    --journal-cell-current-week-text-weight,
    var(--journal-saved-cell-current-week-text-weight)
  );
  --_v-current-week-text-italic: var(
    --journal-cell-current-week-text-italic,
    var(--journal-saved-cell-current-week-text-italic)
  );
  --_v-current-week-week-number-text-color: var(
    --journal-cell-current-week-week-number-text-color,
    var(--journal-saved-cell-current-week-week-number-text-color, var(--text-accent))
  );
  --_v-current-week-week-number-text-weight: var(
    --journal-cell-current-week-week-number-text-weight,
    var(--journal-saved-cell-current-week-week-number-text-weight, var(--font-bold))
  );
  --_v-current-week-week-number-text-italic: var(
    --journal-cell-current-week-week-number-text-italic,
    var(--journal-saved-cell-current-week-week-number-text-italic)
  );
  --_v-current-week-layer: var(--journal-cell-current-week-layer, var(--journal-saved-cell-current-week-layer, -1));
  --_v-weekend-text-color: var(--journal-cell-weekend-text-color, var(--journal-saved-cell-weekend-text-color));
  --_v-weekend-text-weight: var(--journal-cell-weekend-text-weight, var(--journal-saved-cell-weekend-text-weight));
  --_v-weekend-text-italic: var(--journal-cell-weekend-text-italic, var(--journal-saved-cell-weekend-text-italic));
  --_v-weekend-layer: var(--journal-cell-weekend-layer, var(--journal-saved-cell-weekend-layer, -1));
}
@container journal-calendar (max-width: 28em) {
  .notes-calendar-cell {
    --_v-cell-padding: var(
      --journal-cell-cell-padding-narrow,
      var(
        --journal-saved-cell-cell-padding-narrow,
        var(--journal-cell-cell-padding, var(--journal-saved-cell-cell-padding, 0px))
      )
    );
    --_v-cell-radius: var(
      --journal-cell-cell-radius-narrow,
      var(
        --journal-saved-cell-cell-radius-narrow,
        var(--journal-cell-cell-radius, var(--journal-saved-cell-cell-radius, var(--radius-s)))
      )
    );
    --_v-cell-min-height: var(
      --journal-cell-cell-min-height-narrow,
      var(--journal-saved-cell-cell-min-height-narrow, 26px)
    );
    --_v-outside-color: var(
      --journal-cell-outside-color-narrow,
      var(
        --journal-saved-cell-outside-color-narrow,
        var(--journal-cell-outside-color, var(--journal-saved-cell-outside-color, transparent))
      )
    );
    --_v-outside-ring-width: var(
      --journal-cell-outside-ring-width-narrow,
      var(
        --journal-saved-cell-outside-ring-width-narrow,
        var(--journal-cell-outside-ring-width, var(--journal-saved-cell-outside-ring-width, 0px))
      )
    );
    --_v-outside-strength: var(
      --journal-cell-outside-strength-narrow,
      var(
        --journal-saved-cell-outside-strength-narrow,
        var(--journal-cell-outside-strength, var(--journal-saved-cell-outside-strength, 0))
      )
    );
    --_v-outside-text-color: var(
      --journal-cell-outside-text-color-narrow,
      var(
        --journal-saved-cell-outside-text-color-narrow,
        var(--journal-cell-outside-text-color, var(--journal-saved-cell-outside-text-color, var(--text-muted)))
      )
    );
    --_v-outside-text-weight: var(
      --journal-cell-outside-text-weight-narrow,
      var(
        --journal-saved-cell-outside-text-weight-narrow,
        var(--journal-cell-outside-text-weight, var(--journal-saved-cell-outside-text-weight))
      )
    );
    --_v-outside-text-italic: var(
      --journal-cell-outside-text-italic-narrow,
      var(
        --journal-saved-cell-outside-text-italic-narrow,
        var(--journal-cell-outside-text-italic, var(--journal-saved-cell-outside-text-italic))
      )
    );
    --_v-outside-layer: var(
      --journal-cell-outside-layer-narrow,
      var(
        --journal-saved-cell-outside-layer-narrow,
        var(--journal-cell-outside-layer, var(--journal-saved-cell-outside-layer, -1))
      )
    );
    --_v-today-color: var(
      --journal-cell-today-color-narrow,
      var(
        --journal-saved-cell-today-color-narrow,
        var(--journal-cell-today-color, var(--journal-saved-cell-today-color, transparent))
      )
    );
    --_v-today-ring-width: var(
      --journal-cell-today-ring-width-narrow,
      var(
        --journal-saved-cell-today-ring-width-narrow,
        var(--journal-cell-today-ring-width, var(--journal-saved-cell-today-ring-width, 0px))
      )
    );
    --_v-today-strength: var(
      --journal-cell-today-strength-narrow,
      var(
        --journal-saved-cell-today-strength-narrow,
        var(--journal-cell-today-strength, var(--journal-saved-cell-today-strength, 0))
      )
    );
    --_v-today-text-color: var(
      --journal-cell-today-text-color-narrow,
      var(
        --journal-saved-cell-today-text-color-narrow,
        var(--journal-cell-today-text-color, var(--journal-saved-cell-today-text-color, var(--text-accent)))
      )
    );
    --_v-today-text-weight: var(
      --journal-cell-today-text-weight-narrow,
      var(
        --journal-saved-cell-today-text-weight-narrow,
        var(--journal-cell-today-text-weight, var(--journal-saved-cell-today-text-weight))
      )
    );
    --_v-today-text-italic: var(
      --journal-cell-today-text-italic-narrow,
      var(
        --journal-saved-cell-today-text-italic-narrow,
        var(--journal-cell-today-text-italic, var(--journal-saved-cell-today-text-italic))
      )
    );
    --_v-today-layer: var(
      --journal-cell-today-layer-narrow,
      var(
        --journal-saved-cell-today-layer-narrow,
        var(--journal-cell-today-layer, var(--journal-saved-cell-today-layer, -1))
      )
    );
    --_v-selected-color: var(
      --journal-cell-selected-color-narrow,
      var(
        --journal-saved-cell-selected-color-narrow,
        var(--journal-cell-selected-color, var(--journal-saved-cell-selected-color, var(--interactive-accent)))
      )
    );
    --_v-selected-ring-width: var(
      --journal-cell-selected-ring-width-narrow,
      var(
        --journal-saved-cell-selected-ring-width-narrow,
        var(--journal-cell-selected-ring-width, var(--journal-saved-cell-selected-ring-width, 2px))
      )
    );
    --_v-selected-strength: var(
      --journal-cell-selected-strength-narrow,
      var(
        --journal-saved-cell-selected-strength-narrow,
        var(--journal-cell-selected-strength, var(--journal-saved-cell-selected-strength, 0))
      )
    );
    --_v-selected-text-color: var(
      --journal-cell-selected-text-color-narrow,
      var(
        --journal-saved-cell-selected-text-color-narrow,
        var(--journal-cell-selected-text-color, var(--journal-saved-cell-selected-text-color))
      )
    );
    --_v-selected-text-weight: var(
      --journal-cell-selected-text-weight-narrow,
      var(
        --journal-saved-cell-selected-text-weight-narrow,
        var(--journal-cell-selected-text-weight, var(--journal-saved-cell-selected-text-weight))
      )
    );
    --_v-selected-text-italic: var(
      --journal-cell-selected-text-italic-narrow,
      var(
        --journal-saved-cell-selected-text-italic-narrow,
        var(--journal-cell-selected-text-italic, var(--journal-saved-cell-selected-text-italic))
      )
    );
    --_v-selected-layer: var(
      --journal-cell-selected-layer-narrow,
      var(
        --journal-saved-cell-selected-layer-narrow,
        var(--journal-cell-selected-layer, var(--journal-saved-cell-selected-layer, 1))
      )
    );
    --_v-active-color: var(
      --journal-cell-active-color-narrow,
      var(
        --journal-saved-cell-active-color-narrow,
        var(--journal-cell-active-color, var(--journal-saved-cell-active-color, var(--interactive-accent)))
      )
    );
    --_v-active-ring-width: var(
      --journal-cell-active-ring-width-narrow,
      var(
        --journal-saved-cell-active-ring-width-narrow,
        var(--journal-cell-active-ring-width, var(--journal-saved-cell-active-ring-width, 0px))
      )
    );
    --_v-active-strength: var(
      --journal-cell-active-strength-narrow,
      var(
        --journal-saved-cell-active-strength-narrow,
        var(--journal-cell-active-strength, var(--journal-saved-cell-active-strength, 1))
      )
    );
    --_v-active-text-color: var(
      --journal-cell-active-text-color-narrow,
      var(
        --journal-saved-cell-active-text-color-narrow,
        var(--journal-cell-active-text-color, var(--journal-saved-cell-active-text-color, var(--text-on-accent)))
      )
    );
    --_v-active-text-weight: var(
      --journal-cell-active-text-weight-narrow,
      var(
        --journal-saved-cell-active-text-weight-narrow,
        var(--journal-cell-active-text-weight, var(--journal-saved-cell-active-text-weight))
      )
    );
    --_v-active-text-italic: var(
      --journal-cell-active-text-italic-narrow,
      var(
        --journal-saved-cell-active-text-italic-narrow,
        var(--journal-cell-active-text-italic, var(--journal-saved-cell-active-text-italic))
      )
    );
    --_v-active-layer: var(
      --journal-cell-active-layer-narrow,
      var(
        --journal-saved-cell-active-layer-narrow,
        var(--journal-cell-active-layer, var(--journal-saved-cell-active-layer, -1))
      )
    );
    --_v-current-week-text-color: var(
      --journal-cell-current-week-text-color-narrow,
      var(
        --journal-saved-cell-current-week-text-color-narrow,
        var(--journal-cell-current-week-text-color, var(--journal-saved-cell-current-week-text-color))
      )
    );
    --_v-current-week-text-weight: var(
      --journal-cell-current-week-text-weight-narrow,
      var(
        --journal-saved-cell-current-week-text-weight-narrow,
        var(--journal-cell-current-week-text-weight, var(--journal-saved-cell-current-week-text-weight))
      )
    );
    --_v-current-week-text-italic: var(
      --journal-cell-current-week-text-italic-narrow,
      var(
        --journal-saved-cell-current-week-text-italic-narrow,
        var(--journal-cell-current-week-text-italic, var(--journal-saved-cell-current-week-text-italic))
      )
    );
    --_v-current-week-week-number-text-color: var(
      --journal-cell-current-week-week-number-text-color-narrow,
      var(
        --journal-saved-cell-current-week-week-number-text-color-narrow,
        var(
          --journal-cell-current-week-week-number-text-color,
          var(--journal-saved-cell-current-week-week-number-text-color, var(--text-accent))
        )
      )
    );
    --_v-current-week-week-number-text-weight: var(
      --journal-cell-current-week-week-number-text-weight-narrow,
      var(
        --journal-saved-cell-current-week-week-number-text-weight-narrow,
        var(
          --journal-cell-current-week-week-number-text-weight,
          var(--journal-saved-cell-current-week-week-number-text-weight, var(--font-bold))
        )
      )
    );
    --_v-current-week-week-number-text-italic: var(
      --journal-cell-current-week-week-number-text-italic-narrow,
      var(
        --journal-saved-cell-current-week-week-number-text-italic-narrow,
        var(
          --journal-cell-current-week-week-number-text-italic,
          var(--journal-saved-cell-current-week-week-number-text-italic)
        )
      )
    );
    --_v-current-week-layer: var(
      --journal-cell-current-week-layer-narrow,
      var(
        --journal-saved-cell-current-week-layer-narrow,
        var(--journal-cell-current-week-layer, var(--journal-saved-cell-current-week-layer, -1))
      )
    );
    --_v-weekend-text-color: var(
      --journal-cell-weekend-text-color-narrow,
      var(
        --journal-saved-cell-weekend-text-color-narrow,
        var(--journal-cell-weekend-text-color, var(--journal-saved-cell-weekend-text-color))
      )
    );
    --_v-weekend-text-weight: var(
      --journal-cell-weekend-text-weight-narrow,
      var(
        --journal-saved-cell-weekend-text-weight-narrow,
        var(--journal-cell-weekend-text-weight, var(--journal-saved-cell-weekend-text-weight))
      )
    );
    --_v-weekend-text-italic: var(
      --journal-cell-weekend-text-italic-narrow,
      var(
        --journal-saved-cell-weekend-text-italic-narrow,
        var(--journal-cell-weekend-text-italic, var(--journal-saved-cell-weekend-text-italic))
      )
    );
    --_v-weekend-layer: var(
      --journal-cell-weekend-layer-narrow,
      var(
        --journal-saved-cell-weekend-layer-narrow,
        var(--journal-cell-weekend-layer, var(--journal-saved-cell-weekend-layer, -1))
      )
    );
  }
}
.notes-calendar-cell[data-inactive] {
  cursor: default;
}
/* A cell takes a tab stop, so it has to show where the keyboard is. A real <button> gets a
   focus ring from Obsidian for free; a span with tabindex does not, which would leave a
   keyboard user tabbing ~35 cells with nothing to see. Same rule as the date-picker grid. */
.notes-calendar-cell:focus-visible {
  outline: 2px solid var(--background-modifier-border-focus);
  outline-offset: -1px;
}
/* Text precedence, highest first: open note, selected, today, current week, weekend, outside, then the part's own value
   (`--_part-color`, and the weight and italic the grid sets on week numbers and dates). Each applicable
   state sets its private value with no fallback, so an unset value is guaranteed-invalid and the chains
   fall through to the next state. "Unchanged" is the token `unchanged` in the value itself: a style
   query on the text span sets the private value to `initial` there, so it falls through like an unset
   one instead of blocking the lower states. The layer never decides who wins, only whether the winner
   paints over a decoration's text or under it. */
.notes-calendar-cell[data-outside] {
  --_text-outside: var(--_v-outside-text-color);
  --_weight-outside: var(--_v-outside-text-weight);
  --_italic-outside: var(--_v-outside-text-italic);
  --_over-outside: calc(clamp(0, var(--_v-outside-layer), 1) * 100%);
}
.notes-calendar-cell[data-weekend] {
  --_text-weekend: var(--_v-weekend-text-color);
  --_weight-weekend: var(--_v-weekend-text-weight);
  --_italic-weekend: var(--_v-weekend-text-italic);
  --_over-weekend: calc(clamp(0, var(--_v-weekend-layer), 1) * 100%);
}
.notes-calendar-cell[data-current-week] {
  --_text-current-week: var(--_v-current-week-text-color);
  --_weight-current-week: var(--_v-current-week-text-weight);
  --_italic-current-week: var(--_v-current-week-text-italic);
  --_over-current-week: calc(clamp(0, var(--_v-current-week-layer), 1) * 100%);
}
/* The week number has its own text group, so its days can stay plain while it is marked. */
.notes-calendar-cell[data-current-week][data-kind="week"] {
  --_text-current-week: var(--_v-current-week-week-number-text-color);
  --_weight-current-week: var(--_v-current-week-week-number-text-weight);
  --_italic-current-week: var(--_v-current-week-week-number-text-italic);
}
.notes-calendar-cell[data-today] {
  --_text-today: var(--_v-today-text-color);
  --_weight-today: var(--_v-today-text-weight);
  --_italic-today: var(--_v-today-text-italic);
  --_over-today: calc(clamp(0, var(--_v-today-layer), 1) * 100%);
}
.notes-calendar-cell[data-selected] {
  --_text-selected: var(--_v-selected-text-color);
  --_weight-selected: var(--_v-selected-text-weight);
  --_italic-selected: var(--_v-selected-text-italic);
  --_over-selected: calc(clamp(0, var(--_v-selected-layer), 1) * 100%);
}
.notes-calendar-cell[data-active] {
  --_text-active: var(--_v-active-text-color);
  --_weight-active: var(--_v-active-text-weight);
  --_italic-active: var(--_v-active-text-italic);
  --_over-active: calc(clamp(0, var(--_v-active-layer), 1) * 100%);
}
/* A style query is answered by the parent, so these clear the private values on the span, whose
   parent (the cell) holds the resolved `--_v-*` at either width. On the cell itself they would be
   answered by the grid, which has none, so the text span exists for them. */
@container style(--_v-outside-text-color: unchanged) {
  .notes-calendar-cell[data-outside] > .notes-calendar-cell__text {
    --_text-outside: initial;
  }
}
@container style(--_v-outside-text-weight: unchanged) {
  .notes-calendar-cell[data-outside] > .notes-calendar-cell__text {
    --_weight-outside: initial;
  }
}
@container style(--_v-outside-text-italic: unchanged) {
  .notes-calendar-cell[data-outside] > .notes-calendar-cell__text {
    --_italic-outside: initial;
  }
}
@container style(--_v-weekend-text-color: unchanged) {
  .notes-calendar-cell[data-weekend] > .notes-calendar-cell__text {
    --_text-weekend: initial;
  }
}
@container style(--_v-weekend-text-weight: unchanged) {
  .notes-calendar-cell[data-weekend] > .notes-calendar-cell__text {
    --_weight-weekend: initial;
  }
}
@container style(--_v-weekend-text-italic: unchanged) {
  .notes-calendar-cell[data-weekend] > .notes-calendar-cell__text {
    --_italic-weekend: initial;
  }
}
@container style(--_v-current-week-text-color: unchanged) {
  .notes-calendar-cell[data-current-week]:not([data-kind="week"]) > .notes-calendar-cell__text {
    --_text-current-week: initial;
  }
}
@container style(--_v-current-week-week-number-text-color: unchanged) {
  .notes-calendar-cell[data-current-week][data-kind="week"] > .notes-calendar-cell__text {
    --_text-current-week: initial;
  }
}
@container style(--_v-current-week-text-weight: unchanged) {
  .notes-calendar-cell[data-current-week]:not([data-kind="week"]) > .notes-calendar-cell__text {
    --_weight-current-week: initial;
  }
}
@container style(--_v-current-week-week-number-text-weight: unchanged) {
  .notes-calendar-cell[data-current-week][data-kind="week"] > .notes-calendar-cell__text {
    --_weight-current-week: initial;
  }
}
@container style(--_v-current-week-text-italic: unchanged) {
  .notes-calendar-cell[data-current-week]:not([data-kind="week"]) > .notes-calendar-cell__text {
    --_italic-current-week: initial;
  }
}
@container style(--_v-current-week-week-number-text-italic: unchanged) {
  .notes-calendar-cell[data-current-week][data-kind="week"] > .notes-calendar-cell__text {
    --_italic-current-week: initial;
  }
}
@container style(--_v-today-text-color: unchanged) {
  .notes-calendar-cell[data-today] > .notes-calendar-cell__text {
    --_text-today: initial;
  }
}
@container style(--_v-today-text-weight: unchanged) {
  .notes-calendar-cell[data-today] > .notes-calendar-cell__text {
    --_weight-today: initial;
  }
}
@container style(--_v-today-text-italic: unchanged) {
  .notes-calendar-cell[data-today] > .notes-calendar-cell__text {
    --_italic-today: initial;
  }
}
@container style(--_v-selected-text-color: unchanged) {
  .notes-calendar-cell[data-selected] > .notes-calendar-cell__text {
    --_text-selected: initial;
  }
}
@container style(--_v-selected-text-weight: unchanged) {
  .notes-calendar-cell[data-selected] > .notes-calendar-cell__text {
    --_weight-selected: initial;
  }
}
@container style(--_v-selected-text-italic: unchanged) {
  .notes-calendar-cell[data-selected] > .notes-calendar-cell__text {
    --_italic-selected: initial;
  }
}
@container style(--_v-active-text-color: unchanged) {
  .notes-calendar-cell[data-active] > .notes-calendar-cell__text {
    --_text-active: initial;
  }
}
@container style(--_v-active-text-weight: unchanged) {
  .notes-calendar-cell[data-active] > .notes-calendar-cell__text {
    --_weight-active: initial;
  }
}
@container style(--_v-active-text-italic: unchanged) {
  .notes-calendar-cell[data-active] > .notes-calendar-cell__text {
    --_italic-active: initial;
  }
}
/* Style queries need iOS 18 and Android WebView 111. Below that `unchanged` reaches the span's
   `color` itself, which is invalid and inherits this: the part's own color, never the stock accent
   (a lower state's color is skipped there). Weight and italic degrade the same way. */
.notes-calendar-cell {
  color: var(--_part-color);
}
.notes-calendar-cell__accessible-name {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
/* Not positioned, so the layers, the content and the marks still stack in the cell's own context. */
.notes-calendar-cell__text {
  display: flex;
  flex: 1;
  border-radius: inherit;
  color: var(
    --_text-active,
    var(
      --_text-selected,
      var(--_text-today, var(--_text-current-week, var(--_text-weekend, var(--_text-outside, var(--_part-color)))))
    )
  );
}
/* Raised here, not in the decoration: only this cell's isolated context has layers to clear, and
   z-index in the shared decoration would leak into every other host's stacking context. The border
   is left out on purpose: it is decoration, not content, so the selected ring paints above it.
   Marks and corners sit above the label, as positioned marks sat above the static label before
   layers existed: the content follows the marks in the DOM, so at an equal z-index the label would
   take the pointer from an overflow badge it overlaps. */
.notes-calendar-cell :deep(.cell-decoration__content) {
  position: relative;
  z-index: 2;
  /* Label padding: on top of the decoration's own mark reservation, and never shrinking its fill. */
  padding: var(--_v-cell-padding);
}
/* A label longer than its cell clips there rather than widening the grid, once the view lets the cell
   shrink below its content; a heading cell keeps its content width, so its label never clips. Only the
   inline axis clips, because at `line-height: 1` descenders overflow the line box. Gated on the grid
   rendering a custom day label, so stock grids keep the content-sized floor they always had. */
[data-custom-day-label] .notes-calendar-cell__text {
  min-width: 0;
}
[data-custom-day-label] .notes-calendar-cell :deep(.cell-decoration) {
  min-width: 0;
}
[data-custom-day-label] .notes-calendar-cell :deep(.cell-decoration__content) {
  min-width: 0;
  overflow-x: clip;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* A decoration paints its text color with !important on the element around the label, which beats
   the span's color, so the label re-resolves the winner itself. Each state's candidate is its text
   mixed by its layer, clamped to a 0%/100% weight: over, the state's text; under, the inherited
   decoration color. A state with no text is invalid and falls through, so the highest state that has
   text wins and only its layer counts. Weight and italic are set here rather than on the cell, where
   an unset chain would unset the week number's bold; here it only inherits. */
.notes-calendar-cell:is(
    [data-outside],
    [data-weekend],
    [data-current-week],
    [data-today],
    [data-selected],
    [data-active]
  )
  :deep(.cell-decoration__content) {
  --_r-outside: color-mix(in srgb, var(--_text-outside) var(--_over-outside), currentColor);
  --_r-weekend: color-mix(in srgb, var(--_text-weekend) var(--_over-weekend), currentColor);
  --_r-current-week: color-mix(in srgb, var(--_text-current-week) var(--_over-current-week), currentColor);
  --_r-today: color-mix(in srgb, var(--_text-today) var(--_over-today), currentColor);
  --_r-selected: color-mix(in srgb, var(--_text-selected) var(--_over-selected), currentColor);
  --_r-active: color-mix(in srgb, var(--_text-active) var(--_over-active), currentColor);
  color: var(
    --_r-active,
    var(--_r-selected, var(--_r-today, var(--_r-current-week, var(--_r-weekend, var(--_r-outside, currentColor)))))
  );
  font-weight: var(
    --_weight-active,
    var(
      --_weight-selected,
      var(--_weight-today, var(--_weight-current-week, var(--_weight-weekend, var(--_weight-outside))))
    )
  );
  font-style: var(
    --_italic-active,
    var(
      --_italic-selected,
      var(--_italic-today, var(--_italic-current-week, var(--_italic-weekend, var(--_italic-outside))))
    )
  );
}
.notes-calendar-cell :deep(.cell-marks),
.notes-calendar-cell :deep(.decoration-corner) {
  z-index: 3;
}
/* The isolated cell traps the popover's z-index, so later sibling cells would paint over its
   overhang; lift the whole cell while the popover is open. */
.notes-calendar-cell:has(.mark-overflow__popover) {
  z-index: var(--layer-popover);
}
.notes-calendar-cell__layer {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}
.notes-calendar-cell__layer[data-layer^="outside-"] {
  --_color: var(--_v-outside-color);
  --_strength: var(--_v-outside-strength);
  --_ring-width: var(--_v-outside-ring-width);
  z-index: var(--_v-outside-layer);
}
.notes-calendar-cell__layer[data-layer^="today-"] {
  --_color: var(--_v-today-color);
  --_strength: var(--_v-today-strength);
  --_ring-width: var(--_v-today-ring-width);
  z-index: var(--_v-today-layer);
}
.notes-calendar-cell__layer[data-layer^="selected-"] {
  --_color: var(--_v-selected-color);
  --_strength: var(--_v-selected-strength);
  --_ring-width: var(--_v-selected-ring-width);
  z-index: var(--_v-selected-layer);
}
.notes-calendar-cell__layer[data-layer^="active-"] {
  --_color: var(--_v-active-color);
  --_strength: var(--_v-active-strength);
  --_ring-width: var(--_v-active-ring-width);
  z-index: var(--_v-active-layer);
}
/* Opacity rather than color-mix: a WebView without color-mix drops the whole declaration, and the
   open note's fill would vanish under its on-accent text. The layer holds only this background. */
.notes-calendar-cell__layer[data-layer$="-fill"] {
  background-color: var(--_color);
  opacity: var(--_strength);
}
/* Decoration marks sit MARK_INSET_PX (resolve-cell.ts) in from the edge to clear the stock selected
   ring; widening it means widening that too. */
.notes-calendar-cell__layer[data-layer$="-ring"] {
  box-shadow: inset 0 0 0 var(--_ring-width) var(--_color);
}
</style>
