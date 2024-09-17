<script setup lang="ts">
import { computed } from "vue";
import type { BorderSettings, JournalDecorationBorder } from "@/types/settings.types";
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import ObsidianDropdown from "@/components/obsidian/ObsidianDropdown.vue";
import DecorationBorderSide from "./DecorationBorderSide.vue";

const props = defineProps<{ decoration: JournalDecorationBorder }>();
const emit = defineEmits<
  <K extends keyof JournalDecorationBorder>(
    event: "change",
    change: {
      prop: K;
      value: JournalDecorationBorder[K];
    },
  ) => void
>();

const border = computed({
  get() {
    return props.decoration.border;
  },
  set(value) {
    emit("change", { prop: "border", value });
  },
});

function updateSize<K extends keyof BorderSettings>(
  side: "left" | "right" | "top" | "bottom",
  change: { prop: K; value: BorderSettings[K] },
): void {
  emit("change", {
    prop: side,
    value: {
      ...props.decoration[side],
      [change.prop]: change.value,
    },
  });
}
</script>

<template>
  <ObsidianSetting name="Border appearance">
    <ObsidianDropdown v-model="border">
      <option value="uniform">Uniform</option>
      <option value="different">Per side setup</option>
    </ObsidianDropdown>
  </ObsidianSetting>
  <DecorationBorderSide
    :label="border === 'uniform' ? '' : 'Left'"
    :border="decoration.left"
    @change="updateSize('left', $event)"
  />
  <template v-if="border !== 'uniform'">
    <DecorationBorderSide label="Top" :border="decoration.top" @change="updateSize('top', $event)" />
    <DecorationBorderSide label="Right" :border="decoration.right" @change="updateSize('right', $event)" />
    <DecorationBorderSide label="Bottom" :border="decoration.bottom" @change="updateSize('bottom', $event)" />
  </template>
</template>
