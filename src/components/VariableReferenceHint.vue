<script setup lang="ts">
import { VueModal } from "./modals/vue-modal";
import VariableReference from "./modals/VariableReference.modal.vue";
import type { JournalSettings } from "../types/settings.types";

const props = defineProps<{
  type: JournalSettings["write"]["type"];
  dateFormat: string;
}>();

function show() {
  new VueModal("Variable reference", VariableReference, {
    type: props.type,
    dateFormat: props.dateFormat,
  }).open();
}
</script>

<template>
  <a href="#" @click.prevent="show">Supported variables.</a>
</template>
