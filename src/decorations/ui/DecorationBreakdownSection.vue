<script setup lang="ts">
import { match } from "ts-pattern";

import { Calendar } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";

import { DecorationsStore } from "../decorations-store";
import { describeCondition } from "../settings/ui/describe-condition";

import { formatPeriod, type BreakdownCell } from "./breakdown-cell";
import DecorationPreview from "./DecorationPreview.vue";

import type { CellAttribution } from "../attribute-cell";
import type { JournalDecoration } from "../config";
import type { Contribution, DecorationSource } from "../engine";
import type { DecorationOwner } from "../owner";
import type { Placement } from "../resolve-cell";

const props = defineProps<{ cell: BreakdownCell; index: number }>();

const store = useService(DecorationsStore);
const calendar = useService(Calendar);

// An interval and the day cell it starts on share a period kind and anchor, so a key derived
// from the period alone would collide. The section's position in this render is unique and,
// unlike a journal name, never needs escaping for `aria-labelledby` (which tokenizes on
// whitespace).
const headingId = `decoration-breakdown-heading-${props.index}`;

// The heading must key off the section's kind, not its period kind: an interval is a "day"-kind
// period at its start anchor, so branching on period.kind would mislabel it as a day cell.
function headingOf(cell: BreakdownCell): string {
  return match(cell)
    .with({ kind: "interval" }, (c) =>
      m.decoration_breakdown_interval_heading({ journal: c.journalName, label: formatPeriod(c.period) }),
    )
    .with({ kind: "fixed" }, (c) =>
      m.decoration_breakdown_cell_heading({ kind: c.period.kind, label: formatPeriod(c.period) }),
    )
    .exhaustive();
}

interface MarkGroup {
  readonly slot: Placement;
  readonly contributions: readonly Contribution[];
}

// Marks are additive across nine slots and never compete, so the modal shows every
// contributing mark side by side instead of the winner/overridden framing properties get —
// grouped by slot, since two marks in different corners are not the same fact.
function markGroupsOf(attribution: CellAttribution): readonly MarkGroup[] {
  const out: MarkGroup[] = [];
  for (const [slot, contributions] of Object.entries(attribution.marks) as [Placement, readonly Contribution[]][]) {
    if (contributions.length > 0) out.push({ slot, contributions });
  }
  return out;
}

function decorationOf(source: DecorationSource): JournalDecoration | undefined {
  return store.list(source.owner).at(source.index);
}

// The owner's kind alone ("Journal") never distinguishes one journal's rule from another's,
// so the display name always carries the identity too, not just the scope.
function ownerLabel(owner: DecorationOwner): string {
  return match(owner)
    .with({ kind: "journal" }, ({ journalName }) =>
      m.decoration_breakdown_owner({ kind: "journal", name: journalName }),
    )
    .with({ kind: "shelf" }, ({ shelfName }) => m.decoration_breakdown_owner({ kind: "shelf", name: shelfName }))
    .with({ kind: "global" }, () => m.decoration_breakdown_owner({ kind: "global", name: "" }))
    .exhaustive();
}

interface Clause {
  readonly mode: "and" | "or";
  readonly text: string;
}

// Mirrors DecorationsSection.vue's row-clauses: the mode word belongs between conditions, or
// an "or" decoration with two conditions reads as if both had to hold.
function clausesOf(source: DecorationSource): readonly Clause[] {
  const decoration = decorationOf(source);
  if (!decoration) return [];
  return decoration.conditions.map((condition) => ({
    mode: decoration.mode,
    text: describeCondition(condition, calendar),
  }));
}
</script>

<template>
  <div role="region" :aria-labelledby="headingId" class="decoration-breakdown__cell">
    <h3 :id="headingId" class="decoration-breakdown__heading">
      {{ headingOf(cell) }}
      <span v-if="cell.isEntry" class="decoration-breakdown__entry-badge">{{
        m.decoration_breakdown_entry_badge()
      }}</span>
    </h3>

    <div class="decoration-breakdown__body">
      <DecorationPreview :styles="cell.styles" />

      <ul class="decoration-breakdown__properties">
        <li v-for="property in cell.attribution.properties" :key="property.property">
          <div
            role="group"
            :aria-label="m.decoration_breakdown_property({ property: property.property })"
            class="decoration-breakdown__row"
          >
            <strong>{{ m.decoration_breakdown_property({ property: property.property }) }}</strong>
            <span>{{ ownerLabel(property.winner.source.owner) }}</span>
            <template v-for="(clause, i) in clausesOf(property.winner.source)" :key="i">
              <span v-if="i > 0" class="mode-word">{{ m.decoration_describe_mode({ kind: clause.mode }) }}</span>
              <span>{{ clause.text }}</span>
            </template>
          </div>

          <div
            v-if="property.overridden.length > 0"
            role="group"
            :aria-label="
              m.decoration_breakdown_overridden_for({
                property: m.decoration_breakdown_property({ property: property.property }),
              })
            "
            class="decoration-breakdown__overridden"
          >
            <h4>{{ m.decoration_breakdown_overridden_heading() }}</h4>
            <div v-for="(loser, i) in property.overridden" :key="i" class="decoration-breakdown__row">
              <span>{{ ownerLabel(loser.source.owner) }}</span>
              <template v-for="(clause, j) in clausesOf(loser.source)" :key="j">
                <span v-if="j > 0" class="mode-word">{{ m.decoration_describe_mode({ kind: clause.mode }) }}</span>
                <span>{{ clause.text }}</span>
              </template>
            </div>
          </div>
        </li>
      </ul>

      <div v-if="markGroupsOf(cell.attribution).length > 0" class="decoration-breakdown__marks">
        <h4>{{ m.decoration_breakdown_marks_heading() }}</h4>
        <div
          v-for="group in markGroupsOf(cell.attribution)"
          :key="group.slot"
          role="group"
          :aria-label="m.decoration_breakdown_slot({ slot: group.slot })"
          class="decoration-breakdown__mark-group"
        >
          <strong>{{ m.decoration_breakdown_slot({ slot: group.slot }) }}</strong>
          <div v-for="(mark, i) in group.contributions" :key="i" class="decoration-breakdown__row">
            <span>{{ ownerLabel(mark.source.owner) }}</span>
            <template v-for="(clause, j) in clausesOf(mark.source)" :key="j">
              <span v-if="j > 0" class="mode-word">{{ m.decoration_describe_mode({ kind: clause.mode }) }}</span>
              <span>{{ clause.text }}</span>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.decoration-breakdown__cell {
  padding: var(--size-4-2) 0;
  border-top: 1px solid var(--background-modifier-border);
}
.decoration-breakdown__heading {
  margin: 0 0 var(--size-4-2) 0;
  font-size: 1em;
  display: flex;
  align-items: baseline;
  gap: var(--size-4-2);
}
.decoration-breakdown__entry-badge {
  text-transform: uppercase;
  font-size: 65%;
  color: var(--text-accent);
}
.decoration-breakdown__body {
  display: flex;
  align-items: flex-start;
  gap: var(--size-4-2);
}
.decoration-breakdown__properties {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
}
.decoration-breakdown__row {
  display: flex;
  gap: var(--size-4-2);
  flex-wrap: wrap;
  align-items: baseline;
}
.decoration-breakdown__overridden h4,
.decoration-breakdown__marks h4 {
  margin: 0;
  text-transform: uppercase;
  font-size: 75%;
  color: var(--text-muted);
}
/* Only the condition text reads as overridden; the scope badge (always the row's first
   child) stays legible so the reader can still tell whose rule lost. */
.decoration-breakdown__overridden .decoration-breakdown__row > span:not(:first-child) {
  text-decoration: line-through;
}
.decoration-breakdown__mark-group {
  margin-top: var(--size-4-2);
}
.mode-word {
  text-transform: uppercase;
  font-size: 75%;
}
</style>
