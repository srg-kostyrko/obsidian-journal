<script setup lang="ts">
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";
import { dateModificationsModal } from "@/templates/ui/modals";

import { variableReferenceModal } from "./modals";

import type { VariableModalContext } from "./variable-context";
import type { Prompt } from "../../prompts/config";

const props = defineProps<{
  context: VariableModalContext;
  journalName: string;
  dateFormat: string;
  hasCycle: boolean;
  numberingVariableNames: readonly string[];
  promptVariables: readonly Pick<Prompt, "variable" | "question" | "type">[];
}>();

const modals = useService(ModalService);

function show(event: Event): void {
  event.preventDefault();
  void modals.open(variableReferenceModal, {
    context: props.context,
    journalName: props.journalName,
    dateFormat: props.dateFormat,
    hasCycle: props.hasCycle,
    numberingVariableNames: props.numberingVariableNames,
    promptVariables: props.promptVariables,
    openModifications: () => {
      void modals.open(dateModificationsModal, {});
    },
  });
}
</script>

<template>
  <a href="#" @click="show">{{ m.journal_edit_variable_reference_link() }}</a>
</template>
