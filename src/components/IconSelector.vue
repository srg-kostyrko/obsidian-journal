<script setup lang="ts">
import { onMounted, ref } from "vue";
import { IconSuggest } from "./suggests/icon-suggest";
import ObsidianIcon from "./obsidian/ObsidianIcon.vue";
import ObsidianTextInput from "../obsidian/components/ObsidianTextInput.vue";
import { useApp } from "@/composables/use-app";

defineProps<{
  placeholder?: string;
}>();
defineEmits<{
  (event: "blur"): void;
  (event: "change", value: string): void;
}>();
const model = defineModel<string>();
const inputCmp = ref<InstanceType<typeof ObsidianTextInput>>();

const app = useApp();

onMounted(() => {
  if (inputCmp.value) {
    new IconSuggest(app, inputCmp.value.$el);
  }
});
</script>

<template>
  <div class="icon-selector">
    <ObsidianIcon :name="model ?? ''" />
    <ObsidianTextInput
      ref="inputCmp"
      v-model="model"
      :placeholder="placeholder"
      @blur="$emit('blur')"
      @change="$emit('change', $event)"
    />
  </div>
</template>

<style scoped>
.icon-selector {
  display: flex;
  align-items: center;
  gap: 5px;
}
</style>
