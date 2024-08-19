<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { FolderSuggest } from "./suggests/folder-suggest";

defineProps<{
  placeholder?: string;
  disabled?: boolean;
}>();
const model = defineModel<string>();
const el = ref<HTMLInputElement>();

let suggest: FolderSuggest;
onMounted(() => {
  if (el.value) {
    suggest = new FolderSuggest(el.value);
  }
});
onBeforeUnmount(() => {
  if (suggest) {
    suggest.close();
  }
});
</script>

<template>
  <input ref="el" v-model="model" type="text" :placeholder="placeholder" :disabled="disabled" spellcheck="false" />
</template>
