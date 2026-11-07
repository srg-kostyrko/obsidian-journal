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
.notes-calendar-divider[data-side="end"] {
  border-inline-end: var(--_v-week-number-divider-width) solid var(--_v-week-number-divider-color);
}
.notes-calendar-divider[data-side="start"] {
  border-inline-start: var(--_v-week-number-divider-width) solid var(--_v-week-number-divider-color);
}
</style>
