<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { FolderSuggest } from "./suggests/folder-suggest";
import { useApp } from "@/composables/use-app";

defineProps<{
  placeholder?: string;
  disabled?: boolean;
}>();
const model = defineModel<string>();
const element = ref<HTMLInputElement>();
const app = useApp();

let suggest: FolderSuggest;
onMounted(() => {
  if (element.value) {
    suggest = new FolderSuggest(app, element.value);
  }
});
onBeforeUnmount(() => {
  if (suggest) {
    suggest.close();
  }
});
</script>

<template>
  <input ref="element" v-model="model" type="text" :placeholder="placeholder" :disabled="disabled" spellcheck="false" />
</template>
