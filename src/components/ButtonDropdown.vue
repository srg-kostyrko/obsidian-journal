<script setup lang="ts">
import { ref } from "vue";
import ObsidianButton from "./obsidian/ObsidianButton.vue";
import { onClickOutside } from "@vueuse/core";

defineProps<{
  options: { value: string; label: string }[];
}>();
const emit = defineEmits<(event: "select", option: string) => void>();

const isOpen = ref(false);
const buttonRef = ref<InstanceType<typeof ObsidianButton>>();
const popoutRef = ref<HTMLElement>();
const popoutPosition = ref({});

onClickOutside(popoutRef, () => {
  isOpen.value = false;
});

function open() {
  isOpen.value = true;
}
function select(option: string) {
  isOpen.value = false;
  emit("select", option);
}
</script>

<template>
  <div class="button-dropdown">
    <ObsidianButton ref="buttonRef" @click="open"><slot /></ObsidianButton>
    <div v-if="isOpen" ref="popoutRef" class="button-dropdown-popout" :style="popoutPosition">
      <ObsidianButton
        v-for="option in options"
        :key="option.value"
        flat
        class="button-dropdown-option"
        @click="select(option.value)"
      >
        {{ option.label }}
      </ObsidianButton>
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
