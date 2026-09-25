<script setup lang="ts">
import { cloneFnJSON } from "@vueuse/core";
import { computed, reactive } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { SettingsService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { checkboxRuleConditionErrors } from "../rule-form-schema";
import { isEditableCondition } from "../rule-schema";
import { checkboxSlice } from "../slice";

import RuleEditor from "./RuleEditor.vue";
import StatusMapEditor from "./StatusMapEditor.vue";

const api = useModal();
const slice = useService(SettingsService).getSlice(checkboxSlice);

// A deep copy, not a live binding: the editors below mutate their model in place, and the whole
// point of the modal is that nothing reaches settings until Save. cloneFnJSON rather than toRaw —
// toRaw is shallow and the slice embeds reactive proxies at depth.
const storedConditions = cloneFnJSON(slice.state.rule.conditions);

// Conditions this editor cannot render — currently only `status` — captured once at open time and
// never touched by the draft below. RuleEditor's model is filtered to the editable arms only, so
// building the draft straight from the filtered list would silently drop these on the next Save;
// they are spliced back in save() instead, so a stray one (which can only reach storage through a
// hand-edited data.json or a future write, since this UI cannot author one — see rule-schema.ts)
// survives the round trip.
const preservedConditions = storedConditions.filter((condition) => !isEditableCondition(condition));

const draft = reactive({
  statusMap: cloneFnJSON(slice.state.statusMap),
  canonical: cloneFnJSON(slice.state.canonical),
  rule: {
    mode: slice.state.rule.mode,
    conditions: storedConditions.filter(isEditableCondition),
  },
});

// Recomputed on every keystroke against the draft, never against the slice — nothing here
// reaches persistence, so a condition with no values can never fail its schema on reload; see
// rule-form-schema.ts for why storage stays permissive while the form is strict.
const ruleErrors = computed(() => checkboxRuleConditionErrors(draft.rule));
const ruleValid = computed(() => ruleErrors.value.size === 0);

function save(): void {
  // Belt-and-braces alongside the disabled Save button: a disabled native <button> never
  // dispatches click, but nothing stops a future caller from invoking save() directly.
  if (!ruleValid.value) return;
  // Writes back only the fields this modal owns, so a concurrent change to a field it does
  // not own (enabled) survives; a concurrent edit to statusMap/canonical/rule while the
  // modal is open is legitimately overwritten by this Save.
  slice.state.statusMap = draft.statusMap;
  slice.state.canonical = draft.canonical;
  // Edited conditions first, then whatever this editor could not render, in its original
  // relative order — a stable, predictable place for conditions the user never saw or touched.
  slice.state.rule = {
    mode: draft.rule.mode,
    conditions: [...draft.rule.conditions, ...preservedConditions],
  };
  api.submit();
}
</script>

<template>
  <StatusMapEditor v-model:status-map="draft.statusMap" v-model:canonical="draft.canonical" />
  <RuleEditor v-model="draft.rule" :errors="ruleErrors" />
  <UiSettingRow controls-only>
    <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    <UiButton cta :disabled="!ruleValid" @click="save">{{ m.common_action_submit() }}</UiButton>
  </UiSettingRow>
</template>
