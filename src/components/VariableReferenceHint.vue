<script setup lang="ts">
import { VueModal } from "./modals/vue-modal";
import VariableReference from "./modals/VariableReference.modal.vue";
import type { JournalSettings } from "../types/settings.types";
import { useApp } from "@/composables/use-app";
import { usePlugin } from "@/composables/use-plugin";

const props = defineProps<{
  type: JournalSettings["write"]["type"];
  dateFormat: string;
}>();

const app = useApp();
const plugin = usePlugin();

function show() {
  new VueModal(app, plugin, "Variable reference", VariableReference, {
    type: props.type,
    dateFormat: props.dateFormat,
  }).open();
}
</script>

<template>
  <a href="#" @click.prevent="show">Supported variables.</a>
</template>
