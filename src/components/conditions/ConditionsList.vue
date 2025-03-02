<script setup lang="ts">
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ButtonDropdown from "../ButtonDropdown.vue";
import ObsidianIconButton from "../obsidian/ObsidianIconButton.vue";
import type { GenericConditions } from "@/types/settings.types";
import ConditionItem from "./ConditionItem.vue";
import { deepCopy } from "@/utils/misc";
import { defaultConditions } from "@/defaults";

defineProps<{
  mode: string;
  conditions: GenericConditions[];
}>();
const emit = defineEmits<{
  (event: "add-condition", condition: GenericConditions): void;
  (event: "change-condition", index: number, change: { prop: unknown; value: unknown }): void;
  (event: "remove-condition", index: number): void;
}>();

const types = [
  { value: "title", label: "Note title" },
  { value: "tag", label: "Tag" },
  { value: "property", label: "Property" },
];

function addCondition(type: string) {
  emit("add-condition", deepCopy(defaultConditions[type as GenericConditions["type"]]) as GenericConditions);
}
function removeDecorationCondition(index: number) {
  emit("remove-condition", index);
}
function changeCondition(index: number, change: { prop: unknown; value: unknown }) {
  emit("change-condition", index, change);
}
</script>

<template>
  <ObsidianSetting>
    <ButtonDropdown :options="types" @select="addCondition">Add condition</ButtonDropdown>
  </ObsidianSetting>
  <ObsidianSetting v-for="(condition, i) of conditions" :key="i" class="condition-wrapper">
    <span v-if="i > 0" class="mode-hint">{{ mode }}</span>
    <ConditionItem :condition="condition" @change="changeCondition(i, $event)" />
    <ObsidianIconButton icon="trash" @click="removeDecorationCondition(i)" />
  </ObsidianSetting>
  <p v-if="conditions.length === 0" class="journal-hint">No conditions defined yet</p>
</template>
