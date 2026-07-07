<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode, NoticeService } from "@/infrastructure/host";
import { JournalsIndex, OpenDateFlow } from "@/journals";
import { ActiveEntryViewModel } from "@/notes-calendar/active-entry";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";
import UiButton from "@/ui/UiButton.vue";

import { useViewContext } from "../../../view-context";

import type { BlockInstanceId } from "../../../config";
import type { DefinedNavigationConfig } from "../defined-navigation-item";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: DefinedNavigationConfig;
}>();

const context = useViewContext();
const flows = useService(Flows);
const index = useService(JournalsIndex);
const notices = useService(NoticeService);
const activeVM = useService(ActiveEntryViewModel);
const scope = useShelfScope(() => context.shelf.value);

const candidates = computed<readonly string[]>(() => {
  const target = props.config.target;
  if (target === "active") {
    const active = activeVM.active.value;
    return active ? [active.journalName] : [];
  }
  return scope[target].value;
});

function referenceAnchor(): AnchorString {
  const active = activeVM.active.value;
  if (active && candidates.value.includes(active.journalName)) return active.anchor;
  return CalendarDate.today().toAnchor();
}

function navigate(direction: "previous" | "next", event: MouseEvent): void {
  const found = index.findNearestExisting(candidates.value, referenceAnchor(), direction);
  if (found.isNone()) {
    notices.show(direction === "previous" ? m.command_open_no_previous() : m.command_open_no_next());
    return;
  }
  void flows.invoke(OpenDateFlow, {
    anchor: found.value,
    journalNames: [...candidates.value],
    openMode: defineOpenMode(event),
    existingOnly: true,
  });
}
</script>

<template>
  <UiButton
    flat
    :tooltip="config.direction === 'previous' ? m.command_open_previous() : m.command_open_next()"
    :disabled="candidates.length === 0"
    :data-direction="config.direction"
    @click="(event: MouseEvent) => navigate(config.direction, event)"
    @auxclick.middle.prevent="(event: MouseEvent) => navigate(config.direction, event)"
  >
    {{ config.direction === "previous" ? "‹" : "›" }}
  </UiButton>
</template>
