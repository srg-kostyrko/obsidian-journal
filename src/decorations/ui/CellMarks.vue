<script setup lang="ts">
import { computed, nextTick, ref, type ComponentPublicInstance } from "vue";

import { m } from "@/i18n";

import { capMarks } from "../cap-marks";
import { PLACEMENTS, type CellMark, type Placement } from "../resolve-cell";

import DecorationIcon from "./DecorationIcon.vue";
import DecorationShape from "./DecorationShape.vue";
import { clipBoxOf, popoverOffset, type PopoverOffset } from "./popover-position";

const props = defineProps<{ marks: Readonly<Record<Placement, readonly CellMark[]>>; limit: number }>();

const capped = computed(() => capMarks(props.marks, props.limit));
const open = ref<Placement | null>(null);
const anchor = ref<HTMLElement | null>(null);
const popoverEl = ref<HTMLElement | null>(null);
const offset = ref<PopoverOffset | null>(null);
const popoverShift = computed(() => `translate(${offset.value?.dx ?? 0}px, ${offset.value?.dy ?? 0}px)`);

// Not `instanceof HTMLElement`: a popout window builds its nodes from its own constructors, so
// the main window's HTMLElement rejects everything rendered there — and Obsidian's cross-window
// -safe `.instanceOf()` only exists once the real app installs it, so it throws in component tests.
function elementOf(value: unknown): HTMLElement | null {
  const candidate = value as HTMLElement | null;
  return typeof candidate?.getBoundingClientRect === "function" ? candidate : null;
}

async function openPopover(place: Placement, event: MouseEvent): Promise<void> {
  const badge = elementOf(event.currentTarget);
  anchor.value = badge;
  offset.value = null;
  open.value = place;
  // Obsidian hangs its tooltip off the nearest `[aria-label]` ancestor, draws it on the layer
  // above this popover, and ignores a pointer move onto a descendant — so the day cell's date
  // tooltip lands on top of the marks the badge just revealed. The badge's own empty label (see
  // the template) makes the badge that ancestor, which cancels the cell's pending tooltip and
  // shows none of its own; a tooltip already on screen when the pointer arrives needs this too,
  // since a pointerout carrying no relatedTarget is what Obsidian reads as "the pointer left".
  badge?.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse" }));
  // Measured a tick after mounting, not as the popover appears: the marks size themselves through
  // `v-bind()` custom properties, which Vue writes in a post-flush effect, so a box read any
  // earlier holds no marks yet and hangs nowhere near where the laid-out popover will.
  await nextTick();
  const popover = popoverEl.value;
  if (open.value !== place || popover === null || badge === null) return;
  offset.value = popoverOffset(badge.getBoundingClientRect(), popover.getBoundingClientRect(), clipBoxOf(popover));
}

function closePopover(): void {
  open.value = null;
  anchor.value = null;
  offset.value = null;
}

function capturePopover(element: Element | ComponentPublicInstance | null): void {
  popoverEl.value = elementOf(element);
}
</script>

<template>
  <span class="cell-marks">
    <template v-for="place of PLACEMENTS" :key="place">
      <span v-if="marks[place].length > 0" :class="`place place-${place}`">
        <template v-for="(d, i) of capped[place].visible" :key="i">
          <DecorationIcon v-if="d.type === 'icon'" :decoration="d" />
          <DecorationShape v-else :decoration="d" />
        </template>
        <span
          v-if="capped[place].hidden.length > 0"
          class="mark-overflow"
          data-testid="mark-overflow"
          aria-hidden="true"
          aria-label=""
          @mouseenter="void openPopover(place, $event)"
          @mouseleave="closePopover"
        >
          <span class="mark-overflow__count">{{
            m.decoration_mark_overflow_badge({ count: capped[place].hidden.length })
          }}</span>
          <span
            v-if="open === place"
            :ref="capturePopover"
            class="mark-overflow__popover"
            :class="{ 'mark-overflow__popover--placed': offset !== null }"
            data-testid="mark-overflow-popover"
          >
            <template v-for="(d, i) of capped[place].hidden" :key="i">
              <DecorationIcon v-if="d.type === 'icon'" :decoration="d" />
              <DecorationShape v-else :decoration="d" />
            </template>
          </span>
        </span>
      </span>
    </template>
  </span>
</template>

<style scoped>
.cell-marks {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: grid;
  /* minmax(0, 1fr), not 1fr: a grid item's automatic minimum size is its content, so a slot
     holding more than a third of the cell's width — two marks and a badge, in a sidebar — widens
     its own column and shoves the other two slots out past the cell's edge. */
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
}
/* The slot hugs its content and `align-self` seats that box in its third of the cell, so
   `align-items` is free to line the marks up against each other. Stretching the slot instead
   would make the two jobs one, and the badge — taller than any mark — would sit off their line. */
.place {
  display: flex;
  gap: 2px;
  align-items: center;
}
.place-left_top {
  grid-area: 1/1;
  justify-content: flex-start;
  align-self: start;
  padding: 1px 0 0 1px;
}
.place-left_middle {
  grid-area: 2/1;
  justify-content: flex-start;
  align-self: center;
}
.place-left_bottom {
  grid-area: 3/1;
  justify-content: flex-start;
  align-self: end;
  padding: 0 0 1px 1px;
}
.place-center_top {
  grid-area: 1/2;
  justify-content: center;
  align-self: start;
}
.place-center_middle {
  grid-area: 2/2;
  justify-content: center;
  align-self: center;
}
.place-center_bottom {
  grid-area: 3/2;
  justify-content: center;
  align-self: end;
}
.place-right_top {
  grid-area: 1/3;
  justify-content: flex-end;
  align-self: start;
  padding: 1px 1px 0 0;
}
.place-right_middle {
  grid-area: 2/3;
  justify-content: flex-end;
  align-self: center;
}
.place-right_bottom {
  grid-area: 3/3;
  justify-content: flex-end;
  align-self: end;
  padding: 0 1px 1px 0;
}

/* The mark grid is pointer-transparent so a click still reaches the cell underneath. The badge
   is the one thing in it that must receive hover, so it opts back in. */
.mark-overflow {
  pointer-events: auto;
  position: relative;
  flex: none;
  line-height: 1;
  border-radius: var(--radius-s);
  background-color: var(--background-modifier-border);
  color: var(--text-muted);
  cursor: default;
}
/* The shrink sits on the count, not on the badge: the popover renders marks sized in `em` and
   would otherwise inherit the shrink and compound with it. */
.mark-overflow__count {
  display: block;
  padding: 1px 2px;
  font-size: 0.55em;
  line-height: 1;
  font-weight: 600;
}
.mark-overflow__popover {
  position: absolute;
  /* Flush against the badge, no gap: a gap between the badge's border box and the popover's
     hit-tests to the cell behind, which fires the badge's mouseleave and unmounts the popover
     (v-if) while the pointer is still crossing toward it. */
  top: 100%;
  right: 0;
  transform: v-bind(popoverShift);
  z-index: var(--layer-popover);
  /* Shifted from script, so it spends its first frame wherever the badge alone would put it —
     which, near the edge of a narrow surface, is half outside it. */
  visibility: hidden;
  display: flex;
  gap: 4px;
  align-items: center;
  padding: var(--size-2-2) var(--size-2-3);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s);
  background-color: var(--background-secondary);
  box-shadow: var(--shadow-s);
  /* A peek, not a poster: marks read at a multiple of the size they have in the cell. */
  font-size: 2.5em;
  white-space: nowrap;
}
.mark-overflow__popover--placed {
  visibility: visible;
}
</style>
