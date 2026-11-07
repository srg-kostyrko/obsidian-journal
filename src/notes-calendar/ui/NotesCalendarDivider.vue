<script setup lang="ts">
defineProps<{ side: "start" | "end"; column: string; row: string }>();
</script>

<template>
  <span
    class="notes-calendar-divider"
    :data-side="side"
    :style="{ gridColumn: column, gridRow: row }"
    aria-hidden="true"
  />
</template>

<style scoped>
/* Placed by grid lines as a band is (NotesCalendarBand), so it spans the week-number column from the first
   week row to the grid's end edge and moves no cell. */
.notes-calendar-divider {
  --_v-week-number-divider-color: var(
    --journal-cell-week-number-divider-color,
    var(--journal-saved-cell-week-number-divider-color, var(--background-modifier-border))
  );
  --_v-week-number-divider-width: var(
    --journal-cell-week-number-divider-width,
    var(--journal-saved-cell-week-number-divider-width, 1px)
  );
  position: absolute;
  inset: 0;
  /* A line wider than the cell gap reaches into the cells either side, which would paint over it; a cell
     holding an open mark popover lifts itself to the popover layer, above this. */
  z-index: 1;
  pointer-events: none;
}
@container journal-calendar (max-width: 28em) {
  .notes-calendar-divider {
    --_v-week-number-divider-color: var(
      --journal-cell-week-number-divider-color-narrow,
      var(
        --journal-saved-cell-week-number-divider-color-narrow,
        var(
          --journal-cell-week-number-divider-color,
          var(--journal-saved-cell-week-number-divider-color, var(--background-modifier-border))
        )
      )
    );
    --_v-week-number-divider-width: var(
      --journal-cell-week-number-divider-width-narrow,
      var(
        --journal-saved-cell-week-number-divider-width-narrow,
        var(--journal-cell-week-number-divider-width, var(--journal-saved-cell-week-number-divider-width, 1px))
      )
    );
  }
}
/* Pushed out into the gutter, its line centred on the cell gap the grid gives it: inside the column, a filled
   week-number cell (an open weekly note, a decoration) would paint over it. */
.notes-calendar-divider[data-side="end"] {
  inset-inline-end: calc(var(--_v-cell-gap, 0px) / -2 - var(--_v-week-number-divider-width) / 2);
  border-inline-end: var(--_v-week-number-divider-width) solid var(--_v-week-number-divider-color);
}
.notes-calendar-divider[data-side="start"] {
  inset-inline-start: calc(var(--_v-cell-gap, 0px) / -2 - var(--_v-week-number-divider-width) / 2);
  border-inline-start: var(--_v-week-number-divider-width) solid var(--_v-week-number-divider-color);
}
</style>
