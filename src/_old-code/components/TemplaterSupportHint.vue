<script setup lang="ts">
import { VueModal } from "./modals/vue-modal";
import { usePlugin } from "@/composables/use-plugin";
import { canApplyTemplater } from "@/utils/template";
import TemplaterSupportModal from "./modals/TemplaterSupport.modal.vue";

const plugin = usePlugin();
const supportsTemplater = canApplyTemplater(plugin.app, "<% $>");

function show() {
  new VueModal(plugin, "Templater caveats", TemplaterSupportModal, {}).open();
}
</script>

<template>
  <template v-if="supportsTemplater">
    <br />Templater syntax is <a href="#" @click.stop="show">supported</a>.
  </template>
</template>
