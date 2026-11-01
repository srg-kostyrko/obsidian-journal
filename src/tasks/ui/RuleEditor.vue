<script setup lang="ts">
import { computed, reactive } from "vue";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { defaultTaskCondition } from "./rule-condition-defaults";
import RuleConditionRow from "./RuleConditionRow.vue";

import type { StoredTaskCondition, TaskCondition } from "../conditions";

// Typed as the mode/conditions pair rather than a named rule type so every caller (the checkbox
// identification editors and the listing filter's) can bind the same editor to its own rule shape
// — EditJournalTasksModal's carries an extra `compose` field this component never touches.
// Conditions are the full TaskCondition union: which arms this instance actually offers is a
// runtime question, answered by `types` below, not a question the model's own type can answer —
// see RuleConditionRow.vue for why the checkbox editors still never produce a status condition.
const rule = defineModel<{ mode: "and" | "or"; conditions: StoredTaskCondition[] }>({ required: true });

// `label`/`description` are required, not defaulted to the identification-rule wording: the
// listing filter's editor names a different thing, and a silent default would make one caller's
// copy an accident of another's rather than every caller's own choice.
// `showMode` is opt-out, not opt-in: the identification rules this editor was written for do apply
// their own combinator. Only a rule whose mode nothing downstream reads turns it off — a journal's
// listing filter, whose conditions are merged into the surface's query under the surface's mode
// (composeFilters, src/tasks/filter.ts).
const props = withDefaults(
  defineProps<{
    types: readonly TaskCondition["type"][];
    label: string;
    description: string;
    errors?: ReadonlyMap<number, string>;
    showMode?: boolean;
    addLabel?: string;
  }>(),
  { errors: undefined, showMode: true, addLabel: undefined },
);

// Keyed by condition object identity, not index: removeCondition splices the array, which would
// silently reassign an index-keyed touched flag to the wrong row. "Add condition" creates an
// empty row by design, so its error stays quiet until the user has actually left its input once —
// showing it immediately would flag the normal first moment of editing as a mistake.
const touched = reactive(new Set<StoredTaskCondition>());

function addCondition(): void {
  // `.at(0)` rather than a non-null assertion: every caller passes a non-empty `types`, but
  // nothing enforces that at the type level, so an empty list degrades to a no-op button instead
  // of throwing.
  const type = props.types.at(0);
  if (type === undefined) return;
  rule.value.conditions.push(defaultTaskCondition(type));
}

function removeCondition(index: number): void {
  const [condition] = rule.value.conditions.splice(index, 1);
  if (condition) touched.delete(condition);
}

// Deduplicated: two conditions failing the same way would otherwise print one message twice.
const shownErrors = computed(() => {
  const messages = new Set<string>();
  for (const [index, condition] of rule.value.conditions.entries()) {
    const message = props.errors?.get(index);
    if (message && touched.has(condition)) messages.add(message);
  }
  return [...messages];
});
</script>

<template>
  <UiSettingRow :name="label">
    <template #description>
      {{ description }}
      <span v-for="error of shownErrors" :key="error" class="tasks-form-error">{{ error }}</span>
    </template>
    <UiDropdown v-if="showMode" v-model="rule.mode">
      <option value="and">{{ m.tasks_settings_mode_and() }}</option>
      <option value="or">{{ m.tasks_settings_mode_or() }}</option>
    </UiDropdown>
    <UiIconButton
      :icon="icons.action.add"
      :tooltip="addLabel ?? m.tasks_settings_add_condition()"
      data-testid="rule-add-condition"
      @click="addCondition"
    />
  </UiSettingRow>
  <UiSettingRow
    v-for="(condition, index) in rule.conditions"
    :key="index"
    controls-only
    class="tasks-rule-condition-row"
    data-testid="rule-condition-row"
  >
    <span v-if="condition.type === 'unreadable'" class="tasks-rule-condition-unreadable">
      {{ m.tasks_condition_unreadable() }}
    </span>
    <RuleConditionRow
      v-else
      :model-value="condition"
      :types="types"
      @update:model-value="rule.conditions[index] = $event"
      @blur="touched.add(condition)"
    />
    <UiIconButton
      :icon="icons.action.delete"
      :tooltip="m.common_action_delete()"
      data-testid="rule-remove-condition"
      @click="removeCondition(index)"
    />
  </UiSettingRow>
</template>

<style scoped>
/* One column template on every row, so a Heading row's value input lines up with a Tag row's —
   independent flex rows would size their inputs against different dropdown widths. */
.tasks-rule-condition-row :deep(.setting-item-control) {
  flex: 1;
  display: grid;
  grid-template-columns: 8em 9em 1fr auto;
}
.tasks-rule-condition-row :deep(.setting-item-control > select) {
  width: auto;
  max-width: none;
}
.tasks-rule-condition-unreadable {
  grid-column: 1 / -2;
  color: var(--text-error);
}
.tasks-form-error {
  color: var(--text-error);
  display: block;
}
</style>
