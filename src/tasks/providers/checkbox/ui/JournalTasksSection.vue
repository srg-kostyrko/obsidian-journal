<script setup lang="ts">
import { ref, watch } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { JournalsRepository } from "@/journals";
import { manual } from "@/ui/manual";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import RuleEditor from "./RuleEditor.vue";

import type { CheckboxCondition, CheckboxJournalRule } from "../rule-schema";

const { journalName } = defineProps<{ journalName: string }>();

const journalsRepo = useService(JournalsRepository);

function storedRule(): CheckboxJournalRule | undefined {
  return journalsRepo.get(journalName).getOrUndefined()?.tasks.checkbox;
}

const compose = ref<CheckboxJournalRule["compose"]>(storedRule()?.compose ?? "inherit");

// A local copy rather than a live binding into the journal config: RuleEditor mutates its model
// in place (pushing conditions, flipping mode) instead of reassigning it, so nothing here would
// ever observe an edit through a v-model setter. The deep watch below is what turns each of those
// mutations into a JournalsRepository.update() call — the only signal TaskHostService refreshes
// the task index on, since it gates a refresh on `tasks` appearing in an `updated` event's
// changed keys, not on the settings object simply having new values.
const editable = ref<{ mode: "and" | "or"; conditions: CheckboxCondition[] }>({
  mode: storedRule()?.mode ?? "and",
  conditions: storedRule()?.conditions.map((condition) => ({ ...condition })) ?? [],
});

function persist(): void {
  const config = journalsRepo.get(journalName);
  if (config.isNone()) return;
  const checkbox: CheckboxJournalRule | undefined =
    compose.value === "inherit"
      ? undefined
      : {
          compose: compose.value,
          mode: editable.value.mode,
          // Copied on the way out, not passed by reference: update() merges shallowly, so handing
          // over this array would make the store hold the very array the editor keeps mutating —
          // and every later keystroke would land in settings without going through persist().
          conditions: editable.value.conditions.map((condition) => ({ ...condition })),
        };
  journalsRepo.update(journalName, { tasks: { ...config.value.tasks, checkbox } });
}

function setCompose(mode: CheckboxJournalRule["compose"]): void {
  compose.value = mode;
  persist();
}

watch(editable, persist, { deep: true });
</script>

<template>
  <UiSettingRow heading :name="m.tasks_journal_section_title()" :help="manual.tasks.journalRule" />
  <UiSettingRow :name="m.tasks_journal_compose()" stacked>
    <template #description>{{ m.tasks_journal_compose_desc() }}</template>
    <div class="tasks-journal-compose" data-testid="compose" :data-value="compose">
      <UiButton :cta="compose === 'inherit'" data-testid="compose-inherit" @click="setCompose('inherit')">
        {{ m.tasks_journal_compose_inherit() }}
      </UiButton>
      <UiButton :cta="compose === 'narrow'" data-testid="compose-narrow" @click="setCompose('narrow')">
        {{ m.tasks_journal_compose_narrow() }}
      </UiButton>
      <UiButton :cta="compose === 'replace'" data-testid="compose-replace" @click="setCompose('replace')">
        {{ m.tasks_journal_compose_replace() }}
      </UiButton>
    </div>
  </UiSettingRow>
  <RuleEditor v-if="compose !== 'inherit'" v-model="editable" />
</template>

<style scoped>
.tasks-journal-compose {
  display: flex;
  gap: var(--size-2-2);
}
</style>
