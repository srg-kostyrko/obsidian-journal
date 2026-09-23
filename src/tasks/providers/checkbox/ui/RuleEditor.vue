<script setup lang="ts">
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

function addCondition(): void {
  rule.value.conditions.push({ type: "tag", condition: "has", tags: [] });
}

function removeCondition(index: number): void {
  rule.value.conditions.splice(index, 1);
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
      <div
        v-for="(condition, index) in rule.conditions"
        :key="index"
        class="tasks-rule-condition-row"
        data-testid="rule-condition-row"
      >
        <RuleConditionRow v-model="rule.conditions[index]" />
        <UiIconButton
          :icon="icons.action.delete"
          :tooltip="m.common_action_delete()"
          data-testid="rule-remove-condition"
          @click="removeCondition(index)"
        />
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
</style>
