<script setup lang="ts">
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { ModalService } from "@/infrastructure/host/modals";

import { codeBlockReferenceModal } from "./modals";

const props = defineProps<{ journalName: string }>();

const modals = useService(ModalService);

function show(event: Event): void {
  event.preventDefault();
  void modals.open(codeBlockReferenceModal, { journalName: props.journalName });
}
</script>

<template>
  <a href="#" @click="show">{{ m.journal_edit_code_block_reference_link() }}</a>
</template>
