<script setup lang="ts">
import { isFormat, isStructure, type Control, type PartKey, type Width } from "../appearance-parts";

import AppearanceStructureControl from "./AppearanceStructureControl.vue";
import AppearanceValueControl from "./AppearanceValueControl.vue";

const { part, control, width } = defineProps<{ part: PartKey; control: Control; width: Width }>();
</script>

<template>
  <AppearanceStructureControl v-if="isStructure(control)" :control="control" />
  <!-- Narrows the part for the value control's props; the grid has no value control to reach here. -->
  <AppearanceValueControl
    v-else-if="!isFormat(control) && part !== 'grid'"
    :part="part"
    :control="control"
    :width="width"
  />
</template>
