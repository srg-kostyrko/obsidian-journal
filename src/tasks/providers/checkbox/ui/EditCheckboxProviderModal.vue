<script setup lang="ts">
import { cloneFnJSON } from "@vueuse/core";
import { reactive } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { SettingsService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { checkboxSlice } from "../slice";

import RuleEditor from "./RuleEditor.vue";
import StatusMapEditor from "./StatusMapEditor.vue";

const api = useModal();
const slice = useService(SettingsService).getSlice(checkboxSlice);

// A deep copy, not a live binding: the editors below mutate their model in place, and the whole
// point of the modal is that nothing reaches settings until Save. cloneFnJSON rather than toRaw —
// toRaw is shallow and the slice embeds reactive proxies at depth.
const draft = reactive({
  statusMap: cloneFnJSON(slice.state.statusMap),
  canonical: cloneFnJSON(slice.state.canonical),
  rule: cloneFnJSON(slice.state.rule),
});

function save(): void {
  // Writes back only the fields this modal owns, so a concurrent change to a field it does
  // not own (enabled) survives; a concurrent edit to statusMap/canonical/rule while the
  // modal is open is legitimately overwritten by this Save.
  slice.state.statusMap = draft.statusMap;
  slice.state.canonical = draft.canonical;
  slice.state.rule = draft.rule;
  api.submit();
}
</script>

<template>
  <StatusMapEditor v-model:status-map="draft.statusMap" v-model:canonical="draft.canonical" />
  <RuleEditor v-model="draft.rule" />
  <UiSettingRow controls-only>
    <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    <UiButton cta @click="save">{{ m.common_action_submit() }}</UiButton>
  </UiSettingRow>
</template>
