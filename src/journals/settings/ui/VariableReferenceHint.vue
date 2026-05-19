<script setup lang="ts">
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";

import { variableReferenceModal } from "./variable-reference-modal";

const props = defineProps<{ journalName: string; dateFormat: string; hasNumbering: boolean }>();

const modals = useService(ModalService);

function show(event: Event): void {
  event.preventDefault();
  void modals.open(variableReferenceModal, {
    journalName: props.journalName,
    dateFormat: props.dateFormat,
    hasNumbering: props.hasNumbering,
  });
}
</script>

<template>
  <a href="#" @click="show">{{ m.journal_edit_variable_reference_link() }}</a>
</template>
