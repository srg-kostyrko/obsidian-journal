<script setup lang="ts">
import { usePathData } from "@/composables/use-path-data";
import ObsidianSetting from "../obsidian/ObsidianSetting.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import ObsidianDropdown from "../obsidian/ObsidianDropdown.vue";
import { useForm } from "vee-validate";
import * as v from "valibot";
import { toTypedSchema } from "@vee-validate/valibot";
import FormErrors from "../FormErrors.vue";
import DatePicker from "../DatePicker.vue";
import ObsidianToggle from "../obsidian/ObsidianToggle.vue";
import { computed, watch } from "vue";
import type { JournalMetadata } from "@/types/journal.types";
import { usePlugin } from "@/composables/use-plugin";

const props = defineProps<{
  path: string;
}>();
const emit = defineEmits(["close"]);

const plugin = usePlugin();
const noteData = usePathData(props.path);

const name = computed(() => plugin.notesManager.getNoteFilename(props.path));
const folder = computed(() => plugin.notesManager.getNoteFolder(props.path));

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
  return plugin.getJournal(journalName.value);
});
const journalStartDate = computed(() => {
  if (!journal.value) return;
  return journal.value.startDate;
});
const journalEndDate = computed(() => {
  if (!journal.value) return;
  return journal.value.endDate;
});
const anchorDate = computed(() => {
  if (!journal.value) return null;
  if (!refDate.value) return null;
  return journal.value.resolveAnchorDate(refDate.value);
});
const metadata = computed<JournalMetadata | null>(() => {
  if (!journal.value) return null;
  if (!anchorDate.value) return null;
  return journal.value.get(anchorDate.value);
});

const existingNote = computed(() => {
  if (!journal.value) return null;
  if (!refDate.value) return null;
  if (!anchorDate.value) return null;
  return plugin.index.get(journal.value.name, anchorDate.value);
});

const notePath = computed(() => {
  if (!metadata.value) return null;
  if (!journal.value) return null;
  return journal.value.getConfiguredPathData(metadata.value);
});

const needRename = computed(() => {
  if (!notePath.value) return false;
  const [, configuredFilename] = notePath.value;
  return name.value !== configuredFilename;
});

const needMove = computed(() => {
  if (!notePath.value) return false;
  const [folderPath] = notePath.value;
  return folder.value !== (folderPath ?? "/");
});

const canSubmit = computed(() => {
  if (!journal.value) return false;
  if (!refDate.value) return false;
  if (existingNote.value && !override.value) return false;
  return true;
});

function disconnect() {
  plugin.disconnectNote(props.path).catch(console.error);
}
const onSubmit = handleSubmit(() => {
  if (!canSubmit.value) return;
  if (!anchorDate.value) return;
  journal.value
    ?.connectNote(props.path, anchorDate.value, {
      override: override.value,
      rename: rename.value,
      move: move.value,
    })
    .catch(console.error);
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
    {{ path }}
    <form @submit="onSubmit">
      <ObsidianSetting name="Journal">
        <template #description>
          <FormErrors :errors="errorBag.journalName" />
        </template>
        <ObsidianDropdown v-model="journalName" v-bind="journalNameAttrs">
          <option v-for="j of plugin.journals" :key="j.name" :value="j.name">
            {{ j.name }}
          </option>
        </ObsidianDropdown>
      </ObsidianSetting>
      <template v-if="journalName">
        <ObsidianSetting name="Date">
          <template #description>
            <FormErrors :errors="errorBag.refDate" />
          </template>
          <DatePicker v-model="refDate" v-bind="anchorDateAttrs" :min="journalStartDate" :max="journalEndDate" />
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
            Note name <b class="u-pop">{{ name }}</b> differs from journal note name config:
            <b class="u-pop">{{ notePath?.[1] ?? "" }}</b>
          </template>
          <ObsidianToggle v-model="rename" v-bind="renameAttrs" />
        </ObsidianSetting>
        <ObsidianSetting v-if="needMove" name="Move?">
          <template #description>
            Note folder <b class="u-pop">{{ folder }}</b> differs from journal folder path config:
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
