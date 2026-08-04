<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { defaultStyle } from "../../defaults";
import DecorationPreview from "../../ui/DecorationPreview.vue";

import CanvasRegionBorder from "./CanvasRegionBorder.vue";
import CanvasRegionCorners from "./CanvasRegionCorners.vue";
import CanvasRegionSlots from "./CanvasRegionSlots.vue";
import CanvasRegionWhole from "./CanvasRegionWhole.vue";
import DecorationLayerStrip from "./DecorationLayerStrip.vue";
import StyleBackground from "./StyleBackground.vue";
import StyleBorder from "./StyleBorder.vue";
import StyleColor from "./StyleColor.vue";
import StyleCorner from "./StyleCorner.vue";
import StyleIcon from "./StyleIcon.vue";
import StyleShape from "./StyleShape.vue";
import { useStyleSlots } from "./use-style-slots";

import type { JournalDecorationCorner, JournalDecorationShape, JournalDecorationStyle } from "../../config";
import type { BorderSideName, Placement } from "../../resolve-cell";
import type { StyleSlotKey } from "../../style-slots";

const props = defineProps<{ name: string; styles: readonly JournalDecorationStyle[] }>();

const slots = useStyleSlots(props.name, () => props.styles);
const activeLayer = ref<StyleSlotKey>("background");
const activeSide = ref<BorderSideName>("top");

const previewDay = new Date().getDate();

const slotIndexOfActive = computed(() => props.styles.findLastIndex((s) => s.type === activeLayer.value));
const activeName = computed(() => `${props.name}.${slotIndexOfActive.value}`);
const isOccupied = computed(() => slotIndexOfActive.value !== -1);

const markPlacement = computed<Placement | undefined>(() => {
  const style = slots.get(activeLayer.value);
  if (style === undefined) return;
  if (style.type !== "shape" && style.type !== "icon") return;
  return `${style.placement_x}_${style.placement_y}`;
});

const cornerPlacement = computed<JournalDecorationCorner["placement"] | undefined>(
  () => slots.get("corner")?.placement,
);

const wholeRegionLabel = computed(() =>
  activeLayer.value === "color"
    ? m.decoration_canvas_region_label({ type: "color" })
    : m.decoration_canvas_region_label({ type: "background" }),
);

// Splitting the Placement string would need a cast back to the two literal unions, so the
// mapping is spelled out instead.
const MARK_PLACEMENTS: Record<
  Placement,
  { x: JournalDecorationShape["placement_x"]; y: JournalDecorationShape["placement_y"] }
> = {
  left_top: { x: "left", y: "top" },
  left_middle: { x: "left", y: "middle" },
  left_bottom: { x: "left", y: "bottom" },
  center_top: { x: "center", y: "top" },
  center_middle: { x: "center", y: "middle" },
  center_bottom: { x: "center", y: "bottom" },
  right_top: { x: "right", y: "top" },
  right_middle: { x: "right", y: "middle" },
  right_bottom: { x: "right", y: "bottom" },
};

// Marks and corners each hold one occupant, so a click on another region moves it rather than
// adding a second. Border is the exception and is handled by chooseSide.
//
// Each handler performs exactly ONE write. An add()-then-put() pair would be wrong: `styles`
// arrives as a prop, and put() re-reads it to find the slot's index, so within one handler the
// second call can still see the pre-add array and push a duplicate. Building the finished style
// from `get() ?? defaultStyle()` and writing once sidesteps the ordering entirely.
function chooseMark(placement: Placement): void {
  const layer = activeLayer.value;
  if (layer !== "shape" && layer !== "icon") return;
  const { x, y } = MARK_PLACEMENTS[placement];
  const style = slots.get(layer) ?? defaultStyle(layer);
  slots.put(layer, { ...style, placement_x: x, placement_y: y });
}

function chooseCorner(placement: JournalDecorationCorner["placement"]): void {
  const style = slots.get("corner") ?? defaultStyle("corner");
  slots.put("corner", { ...style, placement });
}

function chooseWhole(): void {
  const layer = activeLayer.value;
  if (layer !== "background" && layer !== "color") return;
  if (slots.get(layer) === undefined) slots.add(layer);
}

function chooseRing(): void {
  if (slots.get("border") === undefined) slots.add("border");
}

function chooseSide(side: BorderSideName): void {
  activeSide.value = side;
  const border = slots.get("border");
  if (border === undefined) return;
  if (border[side].show) return;
  slots.put("border", { ...border, [side]: { ...border[side], show: true } });
}

// A border with every side hidden would be a filled slot declaring nothing at all, which is
// exactly what an empty slot means. Emptying it keeps the two states distinct.
function removeActive(): void {
  const layer = activeLayer.value;
  if (layer !== "border") {
    slots.remove(layer);
    return;
  }
  const border = slots.get("border");
  if (border === undefined) return;
  if (border.border === "uniform") {
    slots.remove("border");
    return;
  }
  const next = { ...border, [activeSide.value]: { ...border[activeSide.value], show: false } };
  const anyShown = (["top", "right", "bottom", "left"] as const).some((side) => next[side].show);
  if (anyShown) slots.put("border", next);
  else slots.remove("border");
}
</script>

<template>
  <div class="decoration-canvas">
    <DecorationLayerStrip v-model="activeLayer" :occupied="slots.occupied.value" />

    <div class="stage">
      <div class="cell">
        <DecorationPreview :styles="styles">{{ previewDay }}</DecorationPreview>
        <CanvasRegionWhole
          v-if="activeLayer === 'background' || activeLayer === 'color'"
          :label="wholeRegionLabel"
          :occupied="isOccupied"
          @choose="chooseWhole()"
        />
        <CanvasRegionSlots
          v-else-if="activeLayer === 'shape' || activeLayer === 'icon'"
          :occupied="markPlacement"
          @choose="chooseMark"
        />
        <CanvasRegionCorners v-else-if="activeLayer === 'corner'" :occupied="cornerPlacement" @choose="chooseCorner" />
        <CanvasRegionBorder
          v-else
          :border="slots.get('border')"
          :active-side="activeSide"
          @choose-ring="chooseRing"
          @choose-side="chooseSide"
        />
      </div>
    </div>

    <div class="inspector">
      <template v-if="isOccupied">
        <StyleBackground v-if="activeLayer === 'background'" :name="activeName" />
        <StyleColor v-else-if="activeLayer === 'color'" :name="activeName" />
        <StyleShape v-else-if="activeLayer === 'shape'" :name="activeName" />
        <StyleIcon v-else-if="activeLayer === 'icon'" :name="activeName" />
        <StyleCorner v-else-if="activeLayer === 'corner'" :name="activeName" />
        <StyleBorder v-else :name="activeName" :side="activeSide" />
        <UiSettingRow controls-only>
          <UiIconButton
            :icon="icons.action.delete"
            :aria-label="m.decoration_canvas_remove_label()"
            @click="removeActive()"
          />
        </UiSettingRow>
      </template>
      <UiSettingRow v-else no-controls>
        <template #description>
          {{ m.decoration_canvas_empty_hint({ type: activeLayer }) }}
        </template>
      </UiSettingRow>
    </div>
  </div>
</template>

<style scoped>
.decoration-canvas {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
.stage {
  display: flex;
  justify-content: center;
  padding: var(--size-4-4);
}
.cell {
  position: relative;
  width: 180px;
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-ui-larger);
}
</style>
