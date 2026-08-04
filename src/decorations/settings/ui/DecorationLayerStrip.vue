<script setup lang="ts">
import { m } from "@/i18n";

import { STYLE_SLOT_KEYS, type StyleSlotKey } from "../../style-slots";

defineProps<{ occupied: ReadonlySet<StyleSlotKey> }>();
const active = defineModel<StyleSlotKey>({ required: true });
</script>

<template>
  <div class="layer-strip">
    <button
      v-for="key of STYLE_SLOT_KEYS"
      :key="key"
      type="button"
      class="layer-chip"
      :aria-pressed="active === key"
      :aria-label="m.decoration_layer_chip_label({ type: key, state: occupied.has(key) ? 'occupied' : 'empty' })"
      @click="active = key"
    >
      {{ m.decoration_style_type_label({ type: key }) }}
      <span v-if="occupied.has(key)" class="layer-badge" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.layer-strip {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-2-2);
}
.layer-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-1);
  border-radius: var(--radius-l);
  padding: var(--size-2-1) var(--size-4-2);
}
.layer-chip[aria-pressed="true"] {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
}
.layer-badge {
  width: var(--size-2-1);
  height: var(--size-2-1);
  border-radius: 50%;
  background-color: currentColor;
}
</style>
