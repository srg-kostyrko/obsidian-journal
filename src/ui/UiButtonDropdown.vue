<script setup lang="ts">
import { onClickOutside } from "@vueuse/core";
import { ref } from "vue";

import UiButton from "./UiButton.vue";

defineProps<{
  options: { value: string; label: string }[];
}>();
const emit = defineEmits<{
  select: [value: string];
}>();

const isOpen = ref(false);
const popoutRef = ref<HTMLElement>();

onClickOutside(popoutRef, () => {
  isOpen.value = false;
});

function open() {
  isOpen.value = true;
}
function select(value: string) {
  isOpen.value = false;
  emit("select", value);
}
</script>

<template>
  <div class="button-dropdown">
    <UiButton @click="open"><slot /></UiButton>
    <div v-if="isOpen" ref="popoutRef" class="button-dropdown-popout">
      <UiButton
        v-for="option in options"
        :key="option.value"
        flat
        class="button-dropdown-option"
        @click="select(option.value)"
      >
        {{ option.label }}
      </UiButton>
    </div>
  </div>
</template>

<style scoped>
.button-dropdown {
  position: relative;
  display: inline-block;
}
.button-dropdown-popout {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 1000;
  box-shadow: var(--shadow-l);
  background-color: var(--modal-background);
  border-radius: var(--radius-s);
  border: var(--modal-border-width) solid var(--modal-border-color);
  padding: var(--size-2-2);
}
.button-dropdown-option {
  width: 100%;
}
</style>
