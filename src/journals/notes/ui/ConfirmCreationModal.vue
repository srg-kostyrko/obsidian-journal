<script setup lang="ts">
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const props = defineProps<{ journalName: string; noteName: string; typeName?: string }>();
const api = useModal<boolean>();

function confirm(): void {
  api.submit(true);
}

function cancel(): void {
  api.cancel();
}
</script>

<template>
  <div>
    <UiSettingRow>
      <template #description>
        <template v-if="props.typeName === undefined">
          {{ m.confirm_note_creation_body({ noteName: props.noteName, journalName: props.journalName }) }}
        </template>
        <template v-else>
          {{
            m.confirm_notelet_creation_body({
              noteName: props.noteName,
              journalName: props.journalName,
              type: props.typeName,
            })
          }}
        </template>
      </template>
    </UiSettingRow>
    <UiSettingRow>
      <UiButton @click="cancel">{{ m.common_action_cancel() }}</UiButton>
      <UiButton cta @click="confirm">{{ m.confirm_note_creation_confirm() }}</UiButton>
    </UiSettingRow>
  </div>
</template>
