<script setup lang="ts">
import { isStructure, type Control, type PartKey, type Width } from "../appearance-parts";

import AppearanceStructureControl from "./AppearanceStructureControl.vue";
import AppearanceValueControl from "./AppearanceValueControl.vue";

const { part, control, width } = defineProps<{ part: PartKey; control: Control; width: Width }>();
</script>

<template>
  <AppearanceStructureControl v-if="isStructure(control)" :control="control" />
  <AppearanceValueControl v-else-if="part !== 'grid'" :part="part" :control="control" :width="width" />
</template>
