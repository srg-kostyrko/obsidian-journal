<script setup lang="ts" generic="T extends GenericConditions">
import type { Component } from "vue";
import type { GenericConditions } from "@/types/settings.types";
import ConditionNoteName from "./ConditionNoteName.vue";
import ConditionTag from "./ConditionTag.vue";
import ConditionProperty from "./ConditionProperty.vue";
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
  }
  return null;
});
</script>

<template>
  <component :is="component" v-if="component" :condition="condition" @change="$emit('change', $event)" />
</template>
