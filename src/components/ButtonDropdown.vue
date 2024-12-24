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
  if (!buttonRef.value) return;
  const rect = (buttonRef.value.$el as HTMLElement).getBoundingClientRect();
  popoutPosition.value = {
    top: `${rect.top + rect.height}px`,
    left: `${rect.left}px`,
  };
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
    <Teleport to="body">
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
    </Teleport>
  </div>
</template>

<style scoped>
.button-dropdown {
  position: relative;
  display: inline-block;
}
.button-dropdown-popout {
  position: fixed;
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
