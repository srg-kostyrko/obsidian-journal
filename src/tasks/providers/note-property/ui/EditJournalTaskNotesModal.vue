<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { JournalsRepository } from "@/journals/repository";
import VisibilityRuleEditor from "@/tasks/ui/VisibilityRuleEditor.vue";
import { visibilityDraftFrom, visibilityFormErrors, visibilityFrom } from "@/tasks/visibility-rule/form";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { NOTE_PROPERTY_PROVIDER_ID } from "../slice";

const { journalName } = defineProps<{ journalName: string }>();

const api = useModal();
const journals = useService(JournalsRepository);

const draft = ref(
  visibilityDraftFrom(journals.get(journalName).getOrUndefined()?.tasks.providers[NOTE_PROPERTY_PROVIDER_ID]),
);

const valid = computed(() => visibilityFormErrors(draft.value).size === 0);

function save(): void {
  if (!valid.value) return;
  // Re-read across the modal's lifetime: the rest of the journal's task settings must come from the
  // current config, not the one this modal opened on.
  const config = journals.get(journalName);
  if (config.isNone()) {
    api.cancel();
    return;
  }
  journals.update(journalName, {
    tasks: {
      ...config.value.tasks,
      providers: { ...config.value.tasks.providers, [NOTE_PROPERTY_PROVIDER_ID]: visibilityFrom(draft.value) },
    },
  });
  api.submit();
}
</script>

<template>
  <VisibilityRuleEditor
    v-model="draft"
    :description="m.tasks_note_visibility_show_desc()"
    :conditions-description="m.tasks_note_visibility_conditions_desc()"
  />
  <UiSettingRow controls-only>
    <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    <UiButton cta :disabled="!valid" @click="save">{{ m.common_action_submit() }}</UiButton>
  </UiSettingRow>
</template>
