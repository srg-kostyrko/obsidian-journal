<script setup lang="ts">
defineProps<{ column: string; row: string }>();
</script>

<template>
  <span class="notes-calendar-divider" :style="{ gridColumn: column, gridRow: row }" aria-hidden="true" />
</template>

<style scoped>
/* Placed by grid lines as a band is (NotesCalendarBand), so it spans its own track, between the week numbers
   and the days, from the first week row to the grid's end edge, and moves no cell. */
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
  inset-block: 0;
  /* Centred in its track, the line keeps clear of a filled cell on either side. */
  inset-inline: calc(50% - var(--_v-week-number-divider-width) / 2);
  border-inline-start: var(--_v-week-number-divider-width) solid var(--_v-week-number-divider-color);
  /* A line wider than its track reaches into the cells either side, which would paint over it; a cell
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
</style>
