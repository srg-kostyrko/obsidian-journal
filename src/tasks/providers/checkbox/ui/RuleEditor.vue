<script setup lang="ts">
import { reactive } from "vue";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import RuleConditionRow from "./RuleConditionRow.vue";

import type { CheckboxCondition } from "../rule-schema";

// Typed as the mode/conditions pair rather than CheckboxRule so EditJournalTasksModal can bind
// the same editor to a journal rule, which carries an extra `compose` field this component never
// touches.
const rule = defineModel<{ mode: "and" | "or"; conditions: CheckboxCondition[] }>({ required: true });

// The caller (each modal) computes validity from the whole draft via checkboxRuleConditionErrors
// and owns disabling Save — this component only renders the message next to the row it belongs to.
// Not destructured: combining destructure with withDefaults() disables Vue's reactive-destructure
// transform, so `errors` would freeze at its initial value instead of tracking the prop.
const props = withDefaults(defineProps<{ errors?: ReadonlyMap<number, string> }>(), { errors: undefined });

// Keyed by condition object identity, not index: removeCondition splices the array, which would
// silently reassign an index-keyed touched flag to the wrong row. "Add condition" creates an
// empty row by design, so its error stays quiet until the user has actually left its input once —
// showing it immediately would flag the normal first moment of editing as a mistake.
const touched = reactive(new Set<CheckboxCondition>());

function addCondition(): void {
  rule.value.conditions.push({ type: "tag", condition: "has", tags: [] });
}

function removeCondition(index: number): void {
  const [condition] = rule.value.conditions.splice(index, 1);
  if (condition) touched.delete(condition);
}

function errorsFor(condition: CheckboxCondition, index: number): string[] {
  if (!touched.has(condition)) return [];
  const message = props.errors?.get(index);
  return message ? [message] : [];
}
</script>

<template>
  <UiSettingRow :name="m.tasks_settings_rule()" stacked>
    <template #description>{{ m.tasks_settings_rule_desc() }}</template>
    <div class="tasks-rule-body">
      <UiDropdown v-model="rule.mode">
        <option value="and">{{ m.tasks_settings_mode_and() }}</option>
        <option value="or">{{ m.tasks_settings_mode_or() }}</option>
      </UiDropdown>
      <div v-for="(condition, index) in rule.conditions" :key="index" class="tasks-rule-condition">
        <div class="tasks-rule-condition-row" data-testid="rule-condition-row">
          <RuleConditionRow v-model="rule.conditions[index]" @blur="touched.add(condition)" />
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
