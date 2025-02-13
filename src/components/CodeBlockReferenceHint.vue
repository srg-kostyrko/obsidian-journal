<script setup lang="ts">
import { VueModal } from "./modals/vue-modal";
import CodeBlockReferenceModal from "./modals/CodeBlockReference.modal.vue";
import { usePlugin } from "@/composables/use-plugin";
import type { JournalSettings } from "@/types/settings.types";

const { type, journalName } = defineProps<{
  type: JournalSettings["write"]["type"];
  journalName: string;
}>();

const plugin = usePlugin();

function show() {
  new VueModal(
    plugin,
    "Supported code blocks",
    CodeBlockReferenceModal,
    {
      type,
      journalName,
    },
    780,
  ).open();
}
</script>

<template><a href="#" @click.prevent="show">Supported code blocks.</a></template>

<style scoped></style>
