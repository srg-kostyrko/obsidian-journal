<script setup lang="ts">
import { ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { JournalsRepository } from "@/journals/repository";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import RuleEditor from "./RuleEditor.vue";

import type { CheckboxCondition, CheckboxJournalRule } from "../rule-schema";

const { journalName } = defineProps<{ journalName: string }>();

const api = useModal();
const journals = useService(JournalsRepository);

const stored = journals.get(journalName).getOrUndefined()?.tasks.checkbox;

const compose = ref<CheckboxJournalRule["compose"]>(stored?.compose ?? "inherit");
const draft = ref<{ mode: "and" | "or"; conditions: CheckboxCondition[] }>({
  mode: stored?.mode ?? "and",
  conditions: stored?.conditions.map((condition) => ({ ...condition })) ?? [],
});

function save(): void {
  // Re-read across the modal's lifetime: the store can change while it is open, so the other
  // task settings this journal holds must come from the current config, not the opening one.
  const config = journals.get(journalName);
  if (config.isNone()) {
    api.cancel();
    return;
  }
  const checkbox: CheckboxJournalRule | undefined =
    compose.value === "inherit"
      ? undefined
      : {
          compose: compose.value,
          mode: draft.value.mode,
          conditions: draft.value.conditions.map((condition) => ({ ...condition })),
        };
  journals.update(journalName, { tasks: { ...config.value.tasks, checkbox } });
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
  <RuleEditor v-if="compose !== 'inherit'" v-model="draft" />
  <UiSettingRow controls-only>
    <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    <UiButton cta @click="save">{{ m.common_action_submit() }}</UiButton>
  </UiSettingRow>
</template>

<style scoped>
.tasks-journal-compose {
  display: flex;
  gap: var(--size-2-2);
}
</style>
