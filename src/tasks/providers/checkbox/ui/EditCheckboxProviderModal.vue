<script setup lang="ts">
import { cloneFnJSON } from "@vueuse/core";
import { computed, reactive } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { SettingsService } from "@/settings";
import type { TaskCondition } from "@/tasks/conditions";
import { moveDefaultsSlice } from "@/tasks/move/settings";
import RuleEditor from "@/tasks/ui/RuleEditor.vue";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiTextInput from "@/ui/UiTextInput.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { markerErrors, normalizeMarker } from "../marker-form";
import { checkboxRuleConditionErrors } from "../rule-form-schema";
import { isEditableCondition } from "../rule-schema";
import { checkboxSlice } from "../slice";

import StatusMapEditor from "./StatusMapEditor.vue";

// Identification never reads a status condition (rule-schema.ts), so this editor's type dropdown
// never offers one — the only gate that keeps a status condition from ever being written here.
const CHECKBOX_CONDITION_TYPES: readonly TaskCondition["type"][] = ["tag", "heading"];

const api = useModal();
const settings = useService(SettingsService);
const slice = settings.getSlice(checkboxSlice);
const moveDefaults = settings.getSlice(moveDefaultsSlice);

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

// `rule.conditions` is typed as the full TaskCondition union, matching RuleEditor's model —
// CHECKBOX_CONDITION_TYPES above is what actually keeps a status condition out, not this type,
// which only has to be wide enough for RuleEditor to bind to.
const draft = reactive<{
  statusMap: Record<string, string>;
  canonical: Record<string, string>;
  rule: { mode: "and" | "or"; conditions: TaskCondition[] };
  rolledMarker: string;
  moveMode: "copy" | "move";
  moveStamp: boolean;
}>({
  statusMap: cloneFnJSON(slice.state.statusMap),
  canonical: cloneFnJSON(slice.state.canonical),
  rule: {
    mode: slice.state.rule.mode,
    conditions: storedConditions.filter(isEditableCondition),
  },
  rolledMarker: slice.state.rolledMarker,
  moveMode: moveDefaults.state.mode,
  moveStamp: moveDefaults.state.stamp,
});

// Recomputed on every keystroke against the draft, never against the slice — nothing here
// reaches persistence, so a condition with no values can never fail its schema on reload; see
// rule-form-schema.ts for why storage stays permissive while the form is strict.
const ruleErrors = computed(() => checkboxRuleConditionErrors(draft.rule));
const ruleValid = computed(() => ruleErrors.value.size === 0);

const marker = computed(() => normalizeMarker(draft.rolledMarker));
const errorBag = computed(() => ({ rolledMarker: markerErrors(marker.value) }));
// Read against the slice, not the value at open: a marker changed elsewhere while this is open is
// the one the stamped lines carry now.
const markerChanged = computed(() => marker.value !== slice.state.rolledMarker);
const valid = computed(() => ruleValid.value && errorBag.value.rolledMarker.length === 0);

function save(): void {
  // Belt-and-braces alongside the disabled Save button: a disabled native <button> never
  // dispatches click, but nothing stops a future caller from invoking save() directly.
  if (!valid.value) return;
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
  slice.state.rolledMarker = marker.value;
  moveDefaults.state.mode = draft.moveMode;
  moveDefaults.state.stamp = draft.moveStamp;
  api.submit();
}
</script>

<template>
  <StatusMapEditor v-model:status-map="draft.statusMap" v-model:canonical="draft.canonical" />
  <RuleEditor
    v-model="draft.rule"
    :types="CHECKBOX_CONDITION_TYPES"
    :label="m.tasks_settings_rule()"
    :description="m.tasks_settings_rule_desc()"
    :errors="ruleErrors"
  />
  <UiSettingRow :name="m.tasks_move_title()" heading>
    <template #description>{{ m.tasks_move_defaults_desc() }}</template>
  </UiSettingRow>
  <UiSettingRow :name="m.tasks_checkbox_marker()">
    <template #description>
      {{ m.tasks_checkbox_marker_desc() }}
      <span v-if="markerChanged && errorBag.rolledMarker.length === 0" class="tasks-checkbox-marker-changed">
        {{ m.tasks_checkbox_marker_changed() }}
      </span>
      <span v-for="error of errorBag.rolledMarker" :key="error" class="tasks-move-form-error">{{ error }}</span>
    </template>
    <UiTextInput v-model="draft.rolledMarker" placeholder="#rolled" data-testid="checkbox-rolled-marker" />
  </UiSettingRow>
  <UiSettingRow :name="m.tasks_move_mode()">
    <template #description>{{ m.tasks_move_mode_desc() }}</template>
    <UiDropdown v-model="draft.moveMode" data-testid="move-default-mode">
      <option value="copy">{{ m.tasks_move_mode_copy() }}</option>
      <option value="move">{{ m.tasks_move_mode_move() }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.tasks_move_stamp()">
    <template #description>{{ m.tasks_move_stamp_desc() }}</template>
    <UiToggle v-model="draft.moveStamp" :tooltip="m.tasks_move_stamp()" data-testid="move-default-stamp" />
  </UiSettingRow>
  <UiSettingRow controls-only>
    <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    <UiButton cta :disabled="!valid" @click="save">{{ m.common_action_submit() }}</UiButton>
  </UiSettingRow>
</template>

<style scoped>
.tasks-move-form-error {
  color: var(--text-error);
  display: block;
}
.tasks-checkbox-marker-changed {
  color: var(--text-warning);
  display: block;
}
</style>
