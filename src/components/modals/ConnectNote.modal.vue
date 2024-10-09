<script setup lang="ts">
import { TFile } from "obsidian";
import { usePathData } from "@/composables/use-path-data";
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import ObsidianDropdown from "../obsidian/ObsidianDropdown.vue";
import { plugin$ } from "@/stores/obsidian.store";
import { journalsList$ } from "@/stores/settings.store";
import { useForm } from "vee-validate";
import * as v from "valibot";
import { toTypedSchema } from "@vee-validate/valibot";
import FormErrors from "../FormErrors.vue";
import DatePicker from "../DatePicker.vue";
import ObsidianToggle from "../obsidian/ObsidianToggle.vue";
import { computed, ref, watch, watchEffect } from "vue";
import type { JournalMetadata } from "@/types/journal.types";
import { disconnectNote } from "@/utils/journals";

const props = defineProps<{
  file: TFile;
}>();
const emit = defineEmits(["close"]);

const noteData = usePathData(props.file.path);

const { defineField, errorBag, handleSubmit } = useForm({
  initialValues: {
    journalName: "",
    refDate: "",
    override: false,
    rename: false,
    move: false,
  },
  validationSchema: toTypedSchema(
    v.object({
      journalName: v.pipe(v.string(), v.nonEmpty("Journal name is required")),
      refDate: v.pipe(v.string(), v.nonEmpty("Date is required")),
      override: v.boolean(),
      rename: v.boolean(),
      move: v.boolean(),
    }),
  ),
});

const [journalName, journalNameAttrs] = defineField("journalName");
const [refDate, anchorDateAttrs] = defineField("refDate");
const [override, overrideAttrs] = defineField("override");
const [rename, renameAttrs] = defineField("rename");
const [move, moveAttrs] = defineField("move");

watch(refDate, () => {
  override.value = false;
  rename.value = false;
  move.value = false;
});

const journal = computed(() => {
  if (!journalName.value) return null;
  return plugin$.value.getJournal(journalName.value);
});
const anchorDate = computed(() => {
  if (!journal.value) return null;
  if (!refDate.value) return null;
  return journal.value.resolveAnchorDate(refDate.value);
});
const metadata = ref<JournalMetadata | null>(null);
watchEffect(async () => {
  if (!journal.value) return;
  if (!anchorDate.value) return;
  metadata.value = await journal.value.find(anchorDate.value);
});

const existingNote = computed(() => {
  if (!journal.value) return null;
  if (!refDate.value) return null;
  if (!anchorDate.value) return null;
  return plugin$.value.index.get(journal.value.name, anchorDate.value);
});

const notePath = computed(() => {
  if (!metadata.value) return null;
  if (!journal.value) return null;
  return journal.value.getConfiguredPathData(metadata.value);
});

const needRename = computed(() => {
  if (!notePath.value) return false;
  const [, configuredFilename] = notePath.value;
  return props.file.name !== configuredFilename;
});

const needMove = computed(() => {
  if (!notePath.value) return false;
  const [folderPath] = notePath.value;
  return props.file.parent?.path !== (folderPath ?? "/");
});

const canSubmit = computed(() => {
  if (!journal.value) return false;
  if (!refDate.value) return false;
  if (existingNote.value && !override.value) return false;
  return true;
});

function disconnect() {
  disconnectNote(props.file.path);
}
const onSubmit = handleSubmit(() => {
  if (!canSubmit.value) return;
  if (!anchorDate.value) return;
  journal.value?.connectNote(props.file, anchorDate.value, {
    override: override.value,
    rename: rename.value,
    move: move.value,
  });
  emit("close");
});
</script>

<template>
  <div v-if="noteData">
    <ObsidianSetting name="Note is already connected">
      <template #description>
        Journal: <b class="u-pop">{{ noteData.journal }}</b>
      </template>
    </ObsidianSetting>
    <ObsidianSetting>
      <ObsidianButton @click="$emit('close')">Cancel</ObsidianButton>
      <ObsidianButton cta @click="disconnect">Disconnect</ObsidianButton>
    </ObsidianSetting>
  </div>
  <div v-else>
    <form @submit="onSubmit">
      <ObsidianSetting name="Journal">
        <template #description>
          <FormErrors :errors="errorBag.journalName" />
        </template>
        <ObsidianDropdown v-model="journalName" v-bind="journalNameAttrs">
          <option v-for="j of journalsList$" :key="j.name" :value="j.name">
            {{ j.name }}
          </option>
        </ObsidianDropdown>
      </ObsidianSetting>
      <template v-if="journalName">
        <ObsidianSetting name="Date">
          <template #description>
            <FormErrors :errors="errorBag.refDate" />
          </template>
          <DatePicker v-model="refDate" v-bind="anchorDateAttrs" />
        </ObsidianSetting>
        <ObsidianSetting v-if="existingNote" name="Override?">
          <template #description>
            Other note <b class="u-pop">{{ existingNote?.path }}</b> is connected to this date. It will be disconnected
            if override option is on.
          </template>
          <ObsidianToggle v-model="override" v-bind="overrideAttrs" />
        </ObsidianSetting>
        <ObsidianSetting v-if="needRename" name="Rename?">
          <template #description>
            Note name <b class="u-pop">{{ file.name }}</b> differs from journal note name config:
            <b class="u-pop">{{ notePath?.[1] ?? "" }}</b>
          </template>
          <ObsidianToggle v-model="rename" v-bind="renameAttrs" />
        </ObsidianSetting>
        <ObsidianSetting v-if="needMove" name="Move?">
          <template #description>
            Note folder <b class="u-pop">{{ file.parent?.path }}</b> differs from journal folder path config:
            <b class="u-pop">{{ notePath?.[0] ?? "" }}</b>
          </template>
          <ObsidianToggle v-model="move" v-bind="moveAttrs" />
        </ObsidianSetting>
      </template>
      <ObsidianSetting>
        <ObsidianButton @click="$emit('close')">Cancel</ObsidianButton>
        <ObsidianButton cta type="submit" :disabled="!canSubmit">Connect</ObsidianButton>
      </ObsidianSetting>
    </form>
  </div>
</template>

<style scoped></style>
