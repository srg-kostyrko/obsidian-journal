<script setup lang="ts">
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";

import { variableReferenceModal } from "./variable-reference-modal";

import type { VariableModalContext } from "./variable-context";

const props = defineProps<{
  context: VariableModalContext;
  journalName: string;
  dateFormat: string;
  hasCycle: boolean;
  numberingVariableNames: readonly string[];
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
  });
}
</script>

<template>
  <a href="#" @click="show">{{ m.journal_edit_variable_reference_link() }}</a>
</template>
