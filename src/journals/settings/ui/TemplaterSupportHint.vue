<script setup lang="ts">
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { ModalService, TemplaterService } from "@/infrastructure/host";
import I18nWithSlot from "@/ui/I18nWithSlot.vue";

import { templaterSupportModal } from "./modals";

const templater = useService(TemplaterService);
const modals = useService(ModalService);
const supported = templater.isSupported();

function show(event: Event): void {
  event.preventDefault();
  void modals.open(templaterSupportModal, {});
}
</script>

<template>
  <I18nWithSlot v-if="supported" :message="m.journal_edit_templater_supported">
    <a href="#" @click="show">{{ m.journal_edit_templater_supported_link() }}</a>
  </I18nWithSlot>
</template>
