<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useApp } from "@/composables/use-app";
import { TemplateSuggest } from "./suggests/template-suggest";

defineProps<{
  placeholder?: string;
  disabled?: boolean;
}>();
const model = defineModel<string>();
const element = ref<HTMLInputElement>();
const app = useApp();

let suggest: TemplateSuggest;
onMounted(() => {
  if (element.value) {
    suggest = new TemplateSuggest(app, element.value);
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
