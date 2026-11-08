<script setup lang="ts">
import { computed } from "vue";

import type { AnchorString } from "@/calendar";
import { useToday } from "@/calendar/ui";
import { navBlockDecorationScope } from "@/code-blocks/nav/decoration-scopes";
import { periodForJournal } from "@/code-blocks/nav/period-for-journal";
import NavBlock from "@/code-blocks/nav/ui/NavBlock.vue";
import { useService } from "@/infrastructure/di";
import { CycleService, useIndexVersion } from "@/journals";
import type { JournalConfig } from "@/journals";
import { ActiveEntryViewModel } from "@/notes-calendar/active-entry";
import { entryCoversDate } from "@/notes-calendar/entry-coverage";

import { useViewContext } from "../../../view-context";

const props = defineProps<{
  journal: JournalConfig;
  anchor: AnchorString;
  shelf: string | null;
}>();

const activeEntry = useService(ActiveEntryViewModel);
const cycle = useService(CycleService);
const context = useViewContext();
const today = useToday();
const indexVersion = useIndexVersion();

const isActive = computed(() => {
  const current = activeEntry.active.value;
  return current !== null && current.journalName === props.journal.name && current.anchor === props.anchor;
});

// A stored extended end date lives in the index, which is not Vue-reactive.
function covers(date: AnchorString): boolean {
  void indexVersion.value;
  return entryCoversDate(cycle, { journalName: props.journal.name, anchor: props.anchor }, date);
}

const isToday = computed(() => covers(today.value.toAnchor()));
const isSelected = computed(() => covers(context.refDate.value));
const states = computed(() =>
  (
    [
      ["today", isToday.value],
      ["selected", isSelected.value],
      ["active", isActive.value],
    ] as const
  )
    .filter(([, applies]) => applies)
    .map(([state]) => state),
);
// The open note's fill replaces today's; today's ring stays.
const fills = computed(() => states.value.filter((state) => state !== "today" || !isActive.value));
</script>

<template>
  <div
    class="journal-view-custom-intervals__entry"
    :data-anchor="anchor"
    :data-active="isActive || null"
    :data-today="isToday || null"
    :data-selected="isSelected || null"
  >
    <!-- Every fill before every ring, so no state's fill can hide another state's ring. -->
    <span
      v-for="state in fills"
      :key="`${state}-fill`"
      class="journal-interval-row__layer"
      :data-layer="`${state}-fill`"
      aria-hidden="true"
    />
    <span
      v-for="state in states"
      :key="`${state}-ring`"
      class="journal-interval-row__layer"
      :data-layer="`${state}-ring`"
      aria-hidden="true"
    />
    <div class="journal-interval-row__text">
      <NavBlock
        :block="journal.intervalBlock"
        :journal="journal"
        :ref-date="anchor"
        :period="periodForJournal(journal.write, anchor)"
        :block-scope="navBlockDecorationScope"
        :shelf="shelf"
      />
    </div>
  </div>
</template>

<style scoped>
.journal-view-custom-intervals__entry {
  position: relative;
  isolation: isolate;
  border-radius: var(--_v-cell-radius);
}
.journal-view-custom-intervals__entry {
  --_v-cell-padding: var(--journal-cell-cell-padding, var(--journal-saved-cell-cell-padding, 0px));
  --_v-cell-radius: var(--journal-cell-cell-radius, var(--journal-saved-cell-cell-radius, var(--radius-s)));
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
}
@container journal-calendar (max-width: 28em) {
  .journal-view-custom-intervals__entry {
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
      var(--journal-saved-cell-selected-ring-width-narrow, 0px)
    );
    --_v-selected-strength: var(
      --journal-cell-selected-strength-narrow,
      var(--journal-saved-cell-selected-strength-narrow, 0.2)
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
  }
}
.journal-view-custom-intervals__entry[data-today] {
  --_text-today: var(--_v-today-text-color);
  --_weight-today: var(--_v-today-text-weight);
  --_italic-today: var(--_v-today-text-italic);
  --_over-today: calc(clamp(0, var(--_v-today-layer), 1) * 100%);
}
.journal-view-custom-intervals__entry[data-selected] {
  --_text-selected: var(--_v-selected-text-color);
  --_weight-selected: var(--_v-selected-text-weight);
  --_italic-selected: var(--_v-selected-text-italic);
  --_over-selected: calc(clamp(0, var(--_v-selected-layer), 1) * 100%);
}
.journal-view-custom-intervals__entry[data-active] {
  --_text-active: var(--_v-active-text-color);
  --_weight-active: var(--_v-active-text-weight);
  --_italic-active: var(--_v-active-text-italic);
  --_over-active: calc(clamp(0, var(--_v-active-layer), 1) * 100%);
}
/* A style query is answered by the parent, so these clear the private values on the text wrapper, whose
   parent (the row) holds the resolved `--_v-*` at either width. */
@container style(--_v-today-text-color: unchanged) {
  .journal-view-custom-intervals__entry[data-today] > .journal-interval-row__text {
    --_text-today: initial;
  }
}
@container style(--_v-today-text-weight: unchanged) {
  .journal-view-custom-intervals__entry[data-today] > .journal-interval-row__text {
    --_weight-today: initial;
  }
}
@container style(--_v-today-text-italic: unchanged) {
  .journal-view-custom-intervals__entry[data-today] > .journal-interval-row__text {
    --_italic-today: initial;
  }
}
@container style(--_v-selected-text-color: unchanged) {
  .journal-view-custom-intervals__entry[data-selected] > .journal-interval-row__text {
    --_text-selected: initial;
  }
}
@container style(--_v-selected-text-weight: unchanged) {
  .journal-view-custom-intervals__entry[data-selected] > .journal-interval-row__text {
    --_weight-selected: initial;
  }
}
@container style(--_v-selected-text-italic: unchanged) {
  .journal-view-custom-intervals__entry[data-selected] > .journal-interval-row__text {
    --_italic-selected: initial;
  }
}
@container style(--_v-active-text-color: unchanged) {
  .journal-view-custom-intervals__entry[data-active] > .journal-interval-row__text {
    --_text-active: initial;
  }
}
@container style(--_v-active-text-weight: unchanged) {
  .journal-view-custom-intervals__entry[data-active] > .journal-interval-row__text {
    --_weight-active: initial;
  }
}
@container style(--_v-active-text-italic: unchanged) {
  .journal-view-custom-intervals__entry[data-active] > .journal-interval-row__text {
    --_italic-active: initial;
  }
}
/* Resolved on the wrapper, below the queries, and read by each segment. Today's is left out of the chosen
   chain: a color the user gave a segment outranks today's text, never the open note's or the selection's. */
.journal-interval-row__text {
  --_row-text: var(--_text-active, var(--_text-selected, var(--_text-today)));
  --_row-text-chosen: var(--_text-active, var(--_text-selected));
  --_row-weight: var(--_weight-active, var(--_weight-selected, var(--_weight-today)));
  --_row-italic: var(--_italic-active, var(--_italic-selected, var(--_italic-today)));
}
/* A decoration paints its text with !important around the label, which beats the segment's color, so
   the label re-resolves the winner: each state's text mixed by its layer, over or under the decoration's. */
.journal-interval-row__text :deep(.nav-row .cell-decoration__content) {
  --_r-today: color-mix(in srgb, var(--_text-today) var(--_over-today), currentColor);
  --_r-selected: color-mix(in srgb, var(--_text-selected) var(--_over-selected), currentColor);
  --_r-active: color-mix(in srgb, var(--_text-active) var(--_over-active), currentColor);
  color: var(--_r-active, var(--_r-selected, var(--_r-today, currentColor)));
}
.journal-interval-row__text :deep(.nav-row:not([data-default-color]) .cell-decoration__content) {
  color: var(--_r-active, var(--_r-selected, currentColor));
}
/* The isolated row traps the popover's z-index, so later rows would paint over its overhang. */
.journal-view-custom-intervals__entry:has(.mark-overflow__popover) {
  z-index: var(--layer-popover);
}
.journal-view-custom-intervals__entry :deep(.nav-block) {
  padding: var(--_v-cell-padding);
}
.journal-interval-row__layer {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}
.journal-interval-row__layer[data-layer^="today-"] {
  --_color: var(--_v-today-color);
  --_strength: var(--_v-today-strength);
  --_ring-width: var(--_v-today-ring-width);
  z-index: var(--_v-today-layer);
}
.journal-interval-row__layer[data-layer^="selected-"] {
  --_color: var(--_v-selected-color);
  --_strength: var(--_v-selected-strength);
  --_ring-width: var(--_v-selected-ring-width);
  z-index: var(--_v-selected-layer);
}
.journal-interval-row__layer[data-layer^="active-"] {
  --_color: var(--_v-active-color);
  --_strength: var(--_v-active-strength);
  --_ring-width: var(--_v-active-ring-width);
  z-index: var(--_v-active-layer);
}
/* Opacity rather than color-mix: a WebView without color-mix drops the whole declaration. */
.journal-interval-row__layer[data-layer$="-fill"] {
  background-color: var(--_color);
  opacity: var(--_strength);
}
.journal-interval-row__layer[data-layer$="-ring"] {
  box-shadow: inset 0 0 0 var(--_ring-width) var(--_color);
}
</style>
