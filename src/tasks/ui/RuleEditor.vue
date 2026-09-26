<script setup lang="ts">
import { reactive } from "vue";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { defaultTaskCondition } from "./rule-condition-defaults";
import RuleConditionRow from "./RuleConditionRow.vue";

import type { TaskCondition } from "../conditions";

// Typed as the mode/conditions pair rather than a named rule type so every caller (the checkbox
// identification editors and the listing filter's) can bind the same editor to its own rule shape
// — EditJournalTasksModal's carries an extra `compose` field this component never touches.
// Conditions are the full TaskCondition union: which arms this instance actually offers is a
// runtime question, answered by `types` below, not a question the model's own type can answer —
// see RuleConditionRow.vue for why the checkbox editors still never produce a status condition.
const rule = defineModel<{ mode: "and" | "or"; conditions: TaskCondition[] }>({ required: true });

// `label`/`description` are required, not defaulted to the identification-rule wording: the
// listing filter's editor names a different thing, and a silent default would make one caller's
// copy an accident of another's rather than every caller's own choice.
const props = withDefaults(
  defineProps<{
    types: readonly TaskCondition["type"][];
    label: string;
    description: string;
    errors?: ReadonlyMap<number, string>;
  }>(),
  { errors: undefined },
);

// Keyed by condition object identity, not index: removeCondition splices the array, which would
// silently reassign an index-keyed touched flag to the wrong row. "Add condition" creates an
// empty row by design, so its error stays quiet until the user has actually left its input once —
// showing it immediately would flag the normal first moment of editing as a mistake.
const touched = reactive(new Set<TaskCondition>());

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

function errorsFor(condition: TaskCondition, index: number): string[] {
  if (!touched.has(condition)) return [];
  const message = props.errors?.get(index);
  return message ? [message] : [];
}
</script>

<template>
  <UiSettingRow :name="label" stacked>
    <template #description>{{ description }}</template>
    <div class="tasks-rule-body">
      <UiDropdown v-model="rule.mode">
        <option value="and">{{ m.tasks_settings_mode_and() }}</option>
        <option value="or">{{ m.tasks_settings_mode_or() }}</option>
      </UiDropdown>
      <div v-for="(condition, index) in rule.conditions" :key="index" class="tasks-rule-condition">
        <div class="tasks-rule-condition-row" data-testid="rule-condition-row">
          <RuleConditionRow v-model="rule.conditions[index]" :types="types" @blur="touched.add(condition)" />
          <UiIconButton
            :icon="icons.action.delete"
            :tooltip="m.common_action_delete()"
            data-testid="rule-remove-condition"
            @click="removeCondition(index)"
          />
        </div>
        <span v-for="error of errorsFor(condition, index)" :key="error" class="tasks-form-error">{{ error }}</span>
      </div>
      <div class="tasks-rule-actions">
        <UiButton data-testid="rule-add-condition" @click="addCondition">
          {{ m.tasks_settings_add_condition() }}
        </UiButton>
      </div>
    </div>
  </UiSettingRow>
</template>

<style scoped>
.tasks-rule-body {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
/* One shared grid across every row, so a Heading row's value input lines up with a Tag row's —
   independent flex containers size their inputs against different dropdown widths. */
.tasks-rule-condition-row {
  display: grid;
  grid-template-columns: 8em 9em 1fr auto;
  align-items: center;
  gap: var(--size-2-2);
}
.tasks-rule-actions {
  display: flex;
  justify-content: flex-end;
}
.tasks-form-error {
  color: var(--text-error);
  display: block;
}
</style>
