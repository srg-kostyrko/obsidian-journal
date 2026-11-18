<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, type Component } from "vue";

import type { FilterCondition, JournalDecorationCondition } from "@/decorations";

import ConditionDate from "./ConditionDate.vue";
import ConditionHasNote from "./ConditionHasNote.vue";
import ConditionHasNotelet from "./ConditionHasNotelet.vue";
import ConditionLinked from "./ConditionLinked.vue";
import ConditionNoteSize from "./ConditionNoteSize.vue";
import ConditionOffset from "./ConditionOffset.vue";
import ConditionProperty from "./ConditionProperty.vue";
import ConditionTag from "./ConditionTag.vue";
import ConditionTasks from "./ConditionTasks.vue";
import ConditionTitle from "./ConditionTitle.vue";
import ConditionWeekday from "./ConditionWeekday.vue";

const props = defineProps<{
  name: string;
  condition: JournalDecorationCondition | FilterCondition;
  journalName?: string;
  withNoteletScope?: boolean;
}>();

const leaf = computed<Component>(() =>
  match(props.condition.type)
    .with("title", () => ConditionTitle)
    .with("tag", () => ConditionTag)
    .with("property", () => ConditionProperty)
    .with("date", () => ConditionDate)
    .with("weekday", () => ConditionWeekday)
    .with("offset", () => ConditionOffset)
    .with("note-size", () => ConditionNoteSize)
    .with("has-notelet", () => ConditionHasNotelet)
    .with("has-note", () => ConditionHasNote)
    .with("linked", () => ConditionLinked)
    .with("tasks", () => ConditionTasks)
    .exhaustive(),
);

const leafProps = computed<Record<string, unknown>>(() => {
  if (props.condition.type === "has-notelet") return { name: props.name, journalName: props.journalName };
  if (props.condition.type === "tag" || props.condition.type === "property")
    return { name: props.name, journalName: props.journalName, withNoteletScope: props.withNoteletScope };
  return { name: props.name };
});
</script>

<template>
  <component :is="leaf" v-bind="leafProps" />
</template>
