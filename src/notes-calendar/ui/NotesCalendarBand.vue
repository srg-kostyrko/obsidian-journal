<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ kind: "weekend" | "currentWeek"; column: string; row: string }>();

const state = computed(() => (props.kind === "weekend" ? "weekend" : "current-week"));
</script>

<template>
  <span class="notes-calendar-band" :data-band="state" :style="{ gridColumn: column, gridRow: row }" aria-hidden="true">
    <span class="notes-calendar-band__layer" :data-layer="`${state}-fill`" aria-hidden="true" />
    <span class="notes-calendar-band__layer" :data-layer="`${state}-ring`" aria-hidden="true" />
  </span>
</template>

<style scoped>
/* An absolutely positioned grid child spans the grid area its lines name, gaps included, and an `auto` line
   reaches the grid's padding edge; `inset: 0` makes it fill that area rather than sit at its static
   position. It takes no part in auto-placement, so it moves no cell. Every catalog value it reads is
   resolved here, as the cell resolves its own. */
.notes-calendar-band {
  --_v-cell-radius: var(--journal-cell-cell-radius, var(--journal-saved-cell-cell-radius, var(--radius-s)));
  --_v-weekend-color: var(--journal-cell-weekend-color, var(--journal-saved-cell-weekend-color, transparent));
  --_v-weekend-ring-width: var(--journal-cell-weekend-ring-width, var(--journal-saved-cell-weekend-ring-width, 0px));
  --_v-weekend-strength: var(--journal-cell-weekend-strength, var(--journal-saved-cell-weekend-strength, 0));
  --_v-weekend-layer: var(--journal-cell-weekend-layer, var(--journal-saved-cell-weekend-layer, -1));
  --_v-current-week-color: var(
    --journal-cell-current-week-color,
    var(--journal-saved-cell-current-week-color, transparent)
  );
  --_v-current-week-ring-width: var(
    --journal-cell-current-week-ring-width,
    var(--journal-saved-cell-current-week-ring-width, 0px)
  );
  --_v-current-week-strength: var(
    --journal-cell-current-week-strength,
    var(--journal-saved-cell-current-week-strength, 0)
  );
  --_v-current-week-layer: var(--journal-cell-current-week-layer, var(--journal-saved-cell-current-week-layer, -1));
  position: absolute;
  inset: 0;
  border-radius: var(--_v-cell-radius);
  pointer-events: none;
}
@container journal-calendar (max-width: 28em) {
  .notes-calendar-band {
    --_v-cell-radius: var(
      --journal-cell-cell-radius-narrow,
      var(
        --journal-saved-cell-cell-radius-narrow,
        var(--journal-cell-cell-radius, var(--journal-saved-cell-cell-radius, var(--radius-s)))
      )
    );
    --_v-weekend-color: var(
      --journal-cell-weekend-color-narrow,
      var(
        --journal-saved-cell-weekend-color-narrow,
        var(--journal-cell-weekend-color, var(--journal-saved-cell-weekend-color, transparent))
      )
    );
    --_v-weekend-ring-width: var(
      --journal-cell-weekend-ring-width-narrow,
      var(
        --journal-saved-cell-weekend-ring-width-narrow,
        var(--journal-cell-weekend-ring-width, var(--journal-saved-cell-weekend-ring-width, 0px))
      )
    );
    --_v-weekend-strength: var(
      --journal-cell-weekend-strength-narrow,
      var(
        --journal-saved-cell-weekend-strength-narrow,
        var(--journal-cell-weekend-strength, var(--journal-saved-cell-weekend-strength, 0))
      )
    );
    --_v-weekend-layer: var(
      --journal-cell-weekend-layer-narrow,
      var(
        --journal-saved-cell-weekend-layer-narrow,
        var(--journal-cell-weekend-layer, var(--journal-saved-cell-weekend-layer, -1))
      )
    );
    --_v-current-week-color: var(
      --journal-cell-current-week-color-narrow,
      var(
        --journal-saved-cell-current-week-color-narrow,
        var(--journal-cell-current-week-color, var(--journal-saved-cell-current-week-color, transparent))
      )
    );
    --_v-current-week-ring-width: var(
      --journal-cell-current-week-ring-width-narrow,
      var(
        --journal-saved-cell-current-week-ring-width-narrow,
        var(--journal-cell-current-week-ring-width, var(--journal-saved-cell-current-week-ring-width, 0px))
      )
    );
    --_v-current-week-strength: var(
      --journal-cell-current-week-strength-narrow,
      var(
        --journal-saved-cell-current-week-strength-narrow,
        var(--journal-cell-current-week-strength, var(--journal-saved-cell-current-week-strength, 0))
      )
    );
    --_v-current-week-layer: var(
      --journal-cell-current-week-layer-narrow,
      var(
        --journal-saved-cell-current-week-layer-narrow,
        var(--journal-cell-current-week-layer, var(--journal-saved-cell-current-week-layer, -1))
      )
    );
  }
}
.notes-calendar-band__layer {
  position: absolute;
  inset: 0;
  border-radius: inherit;
}
/* Under is 0, painted ahead of the cells because the band precedes them in the grid; over is 1, above
   every cell. Never negative: the grid is not isolated, since that would trap a mark popover inside it, so a
   negative layer would drop behind the pane. */
.notes-calendar-band__layer[data-layer^="weekend-"] {
  --_color: var(--_v-weekend-color);
  --_strength: var(--_v-weekend-strength);
  --_ring-width: var(--_v-weekend-ring-width);
  z-index: clamp(0, var(--_v-weekend-layer), 1);
}
.notes-calendar-band__layer[data-layer^="current-week-"] {
  --_color: var(--_v-current-week-color);
  --_strength: var(--_v-current-week-strength);
  --_ring-width: var(--_v-current-week-ring-width);
  z-index: clamp(0, var(--_v-current-week-layer), 1);
}
/* Opacity rather than color-mix, as the cell's own layers, so a WebView without color-mix keeps the fill. */
.notes-calendar-band__layer[data-layer$="-fill"] {
  background-color: var(--_color);
  opacity: var(--_strength);
}
.notes-calendar-band__layer[data-layer$="-ring"] {
  box-shadow: inset 0 0 0 var(--_ring-width) var(--_color);
}
</style>
