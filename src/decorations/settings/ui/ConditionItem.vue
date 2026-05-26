<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, type Component } from "vue";

import type { JournalDecorationCondition } from "@/decorations";

import ConditionDate from "./ConditionDate.vue";
import ConditionOffset from "./ConditionOffset.vue";
import ConditionProperty from "./ConditionProperty.vue";
import ConditionTag from "./ConditionTag.vue";
import ConditionTitle from "./ConditionTitle.vue";
import ConditionTypeOnly from "./ConditionTypeOnly.vue";
import ConditionWeekday from "./ConditionWeekday.vue";

const props = defineProps<{ name: string; condition: JournalDecorationCondition }>();

const leaf = computed<Component>(() =>
  match(props.condition.type)
    .with("title", () => ConditionTitle)
    .with("tag", () => ConditionTag)
    .with("property", () => ConditionProperty)
    .with("date", () => ConditionDate)
    .with("weekday", () => ConditionWeekday)
    .with("offset", () => ConditionOffset)
    .with("has-note", "has-open-task", "all-tasks-completed", () => ConditionTypeOnly)
    .exhaustive(),
);

const leafProps = computed<Record<string, unknown>>(() =>
  props.condition.type === "has-note" ||
  props.condition.type === "has-open-task" ||
  props.condition.type === "all-tasks-completed"
    ? { type: props.condition.type }
    : { name: props.name },
);
</script>

<template>
  <component :is="leaf" v-bind="leafProps" />
</template>
