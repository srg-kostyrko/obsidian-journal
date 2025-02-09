<script setup lang="ts" generic="T extends JournalDecorationCondition">
import type { Component } from "vue";
import type { JournalDecorationCondition } from "@/types/settings.types";
import ConditionNoteName from "../../conditions/ConditionNoteName.vue";
import ConditionTag from "../../conditions/ConditionTag.vue";
import ConditionProperty from "../../conditions/ConditionProperty.vue";
import ConditionDate from "./ConditionDate.vue";
import ConditionWeekday from "./ConditionWeekday.vue";
import ConditionOffset from "./ConditionOffset.vue";
import ConditionTypeOnly from "./ConditionTypeOnly.vue";
import { computed } from "vue";

const { condition } = defineProps<{ condition: T }>();
defineEmits<
  <K extends keyof T>(
    event: "change",
    change: {
      prop: K;
      value: T[K];
    },
  ) => void
>();

const component = computed((): Component<{ condition: T }> | null => {
  switch (condition.type) {
    case "title": {
      return ConditionNoteName as Component<{ condition: T }>;
    }
    case "tag": {
      return ConditionTag as Component<{ condition: T }>;
    }
    case "property": {
      return ConditionProperty as Component<{ condition: T }>;
    }
    case "date": {
      return ConditionDate as Component<{ condition: T }>;
    }
    case "weekday": {
      return ConditionWeekday as Component<{ condition: T }>;
    }
    case "offset": {
      return ConditionOffset as Component<{ condition: T }>;
    }
    case "all-tasks-completed":
    case "has-note":
    case "has-open-task": {
      return ConditionTypeOnly as Component<{ condition: T }>;
    }
  }
  return null;
});
</script>

<template>
  <component :is="component" v-if="component" :condition="condition" @change="$emit('change', $event)" />
</template>
