<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { useModal } from "@/infrastructure/host/modals";
import { useIndexVersion } from "@/journals/use-index-version";
import { JournalsViewModel } from "@/journals/view-model";
import UiButton from "@/ui/UiButton.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { JournalsIndex } from "../../journals-index";

const props = defineProps<{ journalName: string; typeId: string; typeName: string }>();

const api = useModal<{ mode: "keep" | "clear" | "delete" }>();
const mode = ref<"keep" | "clear" | "delete">("keep");

const journalsVM = useService(JournalsViewModel);
// The prop is the name at the moment the flow opened this modal. The flow itself re-reads the
// type's stored name after this modal closes (it has to: disconnectNoteletsOfType/
// deleteNoteletsOfType match by that name), so this computed keeps the displayed count in step
// with whatever name the flow will actually purge by, rather than freezing on the pre-open value.
const typeName = computed(
  () => journalsVM.getJournal(props.journalName).getOrUndefined()?.notelets[props.typeId]?.name ?? props.typeName,
);

const index = useService(JournalsIndex);
const indexVersion = useIndexVersion();
const affectedCount = computed(() => {
  void indexVersion.value;
  return index.noteletsOfType(props.journalName, typeName.value).length;
});

function submit(): void {
  api.submit({ mode: mode.value });
}
</script>

<template>
  <UiSettingRow no-controls :name="m.journal_notelet_delete_affected_count({ count: affectedCount })" />
  <UiSettingRow :name="m.journal_notelet_delete_mode_label()">
    <template #description>{{ m.journal_notelet_delete_mode_description({ mode }) }}</template>
    <UiDropdown v-model="mode">
      <option value="keep">{{ m.journal_notelet_delete_mode_option({ mode: "keep" }) }}</option>
      <option value="clear">{{ m.journal_notelet_delete_mode_option({ mode: "clear" }) }}</option>
      <option value="delete">{{ m.journal_notelet_delete_mode_option({ mode: "delete" }) }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow controls-only>
    <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    <UiButton cta warning @click="submit">{{ m.common_action_delete() }}</UiButton>
  </UiSettingRow>
</template>
