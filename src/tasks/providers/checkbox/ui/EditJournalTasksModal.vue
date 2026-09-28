<script setup lang="ts">
import { cloneFnJSON } from "@vueuse/core";
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { JournalsRepository } from "@/journals/repository";
import type { TaskCondition } from "@/tasks/conditions";
import RuleEditor from "@/tasks/ui/RuleEditor.vue";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { checkboxRuleConditionErrors } from "../rule-form-schema";
import { isEditableCondition } from "../rule-schema";

import type { CheckboxJournalRule } from "../rule-schema";

const { journalName } = defineProps<{ journalName: string }>();

// Identification never reads a status condition (rule-schema.ts), so this editor's type dropdown
// never offers one — the only gate that keeps a status condition from ever being written here.
const CHECKBOX_CONDITION_TYPES: readonly TaskCondition["type"][] = ["tag", "heading"];

const api = useModal();
const journals = useService(JournalsRepository);

const stored = journals.get(journalName).getOrUndefined()?.tasks.providers.checkbox;

const compose = ref<CheckboxJournalRule["compose"]>(stored?.compose ?? "inherit");
// A deep copy, not a live binding — same reason as EditCheckboxProviderModal's: RuleEditor
// mutates its model in place, and a shallow `{ ...condition }` per condition still shares each
// condition's `tags`/`headings` array with the store. cloneFnJSON rather than toRaw, which is
// shallow and would not touch those nested arrays either.
const storedConditions = stored ? cloneFnJSON(stored.conditions) : [];

// Same round-trip guarantee as EditCheckboxProviderModal's draft: conditions this editor cannot
// render (currently only `status`) are captured once here and spliced back in save(), after the
// edited conditions, so they survive a Save instead of being silently discarded.
const preservedConditions = storedConditions.filter((condition) => !isEditableCondition(condition));

// Typed as the full TaskCondition union, matching RuleEditor's model — CHECKBOX_CONDITION_TYPES
// above is what actually keeps a status condition out, not this type, which only has to be wide
// enough for RuleEditor to bind to.
const draft = ref<{ mode: "and" | "or"; conditions: TaskCondition[] }>({
  mode: stored?.mode ?? "and",
  conditions: storedConditions.filter(isEditableCondition),
});

// Inherit renders no RuleEditor at all, so there is nothing to validate — an empty condition
// left over from a previous narrow/replace draft cannot block a switch back to inherit.
const ruleErrors = computed(() =>
  compose.value === "inherit" ? new Map<number, string>() : checkboxRuleConditionErrors(draft.value),
);
const ruleValid = computed(() => ruleErrors.value.size === 0);

function save(): void {
  // Belt-and-braces alongside the disabled Save button: a disabled native <button> never
  // dispatches click, but nothing stops a future caller from invoking save() directly.
  if (!ruleValid.value) return;
  // Re-read across the modal's lifetime: the store can change while it is open, so the other
  // task settings this journal holds must come from the current config, not the opening one.
  const config = journals.get(journalName);
  if (config.isNone()) {
    api.cancel();
    return;
  }
  // Edited conditions first, then whatever this editor could not render, in its original
  // relative order — the same stable placement as EditCheckboxProviderModal's save().
  const checkbox: CheckboxJournalRule | undefined =
    compose.value === "inherit"
      ? undefined
      : {
          compose: compose.value,
          mode: draft.value.mode,
          conditions: [...draft.value.conditions.map((condition) => ({ ...condition })), ...preservedConditions],
        };
  journals.update(journalName, {
    tasks: { ...config.value.tasks, providers: { ...config.value.tasks.providers, checkbox } },
  });
  api.submit();
}
</script>

<template>
  <UiSettingRow :name="m.tasks_journal_compose()" stacked>
    <template #description>{{ m.tasks_journal_compose_desc() }}</template>
    <div class="tasks-journal-compose">
      <UiButton :cta="compose === 'inherit'" data-testid="compose-inherit" @click="compose = 'inherit'">
        {{ m.tasks_journal_compose_inherit() }}
      </UiButton>
      <UiButton :cta="compose === 'narrow'" data-testid="compose-narrow" @click="compose = 'narrow'">
        {{ m.tasks_journal_compose_narrow() }}
      </UiButton>
      <UiButton :cta="compose === 'replace'" data-testid="compose-replace" @click="compose = 'replace'">
        {{ m.tasks_journal_compose_replace() }}
      </UiButton>
    </div>
  </UiSettingRow>
  <RuleEditor
    v-if="compose !== 'inherit'"
    v-model="draft"
    :types="CHECKBOX_CONDITION_TYPES"
    :label="m.tasks_settings_rule()"
    :description="m.tasks_settings_rule_desc()"
    :errors="ruleErrors"
  />
  <UiSettingRow controls-only>
    <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    <UiButton cta :disabled="!ruleValid" @click="save">{{ m.common_action_submit() }}</UiButton>
  </UiSettingRow>
</template>

<style scoped>
.tasks-journal-compose {
  display: flex;
  gap: var(--size-2-2);
}
</style>
