<script setup lang="ts">
import { cloneFnJSON } from "@vueuse/core";
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import RuleEditor from "./RuleEditor.vue";
import { taskRuleConditionErrors } from "./task-rule-form-schema";

import type { TaskCondition, TaskRule } from "../conditions";

// Store-agnostic on purpose: a journal's listing filter and a tasks view block's own filter are
// the same concept edited the same way, so this modal knows nothing about journals, view blocks,
// or where its result gets written — every caller re-reads its own entity after this resolves and
// writes the submitted rule back itself (see JournalTaskFilterRow.vue and
// TasksViewBlockConfig.vue).
const FILTER_CONDITION_TYPES: readonly TaskCondition["type"][] = ["tag", "heading", "status"];

const { filter } = defineProps<{ filter: TaskRule }>();
const api = useModal<TaskRule>();

// A deep copy, not a live binding: RuleEditor mutates its model in place, and nothing may reach
// the caller until Save. cloneFnJSON rather than toRaw, which is shallow and would not touch each
// condition's own nested tags/headings/statuses array. A ref, not reactive() — RuleEditor's
// v-model needs an assignable binding, and a plain object cannot be reassigned in place.
const draft = ref<TaskRule>(cloneFnJSON(filter));

// Recomputed on every keystroke against the draft, never against `filter` — nothing here reaches
// persistence, so a condition with no values can never fail its schema on reload.
const errors = computed(() => taskRuleConditionErrors(draft.value));
const valid = computed(() => errors.value.size === 0);

function save(): void {
  // Belt-and-braces alongside the disabled Save button: a disabled native <button> never
  // dispatches click, but nothing stops a future caller from invoking save() directly.
  if (!valid.value) return;
  // A copy, not the draft's own array — the caller's store must not end up holding the very
  // array this (now-closing) modal was mutating.
  api.submit(cloneFnJSON(draft.value));
}
</script>

<template>
  <RuleEditor
    v-model="draft"
    :types="FILTER_CONDITION_TYPES"
    :label="m.tasks_filter_conditions_label()"
    :description="m.tasks_filter_conditions_desc()"
    :errors="errors"
  />
  <UiSettingRow controls-only>
    <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    <UiButton cta :disabled="!valid" @click="save">{{ m.common_action_submit() }}</UiButton>
  </UiSettingRow>
</template>
