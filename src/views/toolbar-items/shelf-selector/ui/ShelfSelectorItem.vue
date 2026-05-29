<script setup lang="ts">
import { Menu } from "obsidian";
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { ShelvesRepository } from "@/shelves";
import UiButton from "@/ui/UiButton.vue";

import { useViewContext } from "../../../view-context";

import type { BlockInstanceId } from "../../../config";

defineProps<{ instanceId: BlockInstanceId; config: Record<string, never> }>();

const context = useViewContext();
const shelves = useService(ShelvesRepository);

const label = computed(() => context.shelf.value ?? m.view_toolbar_shelf_selector_all());

function open(event: MouseEvent): void {
  const menu = new Menu();
  menu.addItem((item) => item.setTitle(m.view_toolbar_shelf_selector_all()).onClick(() => context.setShelf(null)));
  for (const shelf of shelves.find().list()) {
    menu.addItem((item) => item.setTitle(shelf.name).onClick(() => context.setShelf(shelf.name)));
  }
  menu.showAtMouseEvent(event);
}
</script>

<template>
  <UiButton flat @click="open">{{ label }}</UiButton>
</template>
