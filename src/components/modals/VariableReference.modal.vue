<script setup lang="ts">
import DisplayVariable from "../DisplayVariable.vue";
import type { JournalSettings } from "../../types/settings.types";
import { computed } from "vue";
import { VueModal } from "./vue-modal";
import DateVariableReferenceModal from "./DateVariableReference.modal.vue";
import { usePlugin } from "@/composables/use-plugin";

const { type } = defineProps<{
  type: JournalSettings["write"]["type"];
  dateFormat: string;
}>();
defineEmits(["close"]);

const plugin = usePlugin();

const typeDescription = computed(() => (type === "custom" ? "interval" : type));

function showDateModifications() {
  new VueModal(plugin, "Date variable modifications", DateVariableReferenceModal, {}).open();
}
</script>

<template>
  <p class="hint">Clicking on variable will copy it to clipboard.</p>
  <div class="grid">
    <div>
      <DisplayVariable name="journal_name" />
    </div>
    <div>Name of corresponding journal</div>
    <div>
      <DisplayVariable name="note_name" />
    </div>
    <div>Name of current note</div>
    <div>
      <DisplayVariable name="title" />
    </div>
    <div>Name of current note (to support core template variable)</div>
    <div>
      <DisplayVariable name="date" />
    </div>
    <div>
      Note reference date formatted using default format settings ({{ dateFormat }}).<br />
      <template v-if="type === 'week'">
        Is usually the first day of the week. But for weeks that are considered part of next year but have several day
        of previous year it will be the last day of week<br />
      </template>
      <template v-else-if="type !== 'day'">
        Is same as first day of {{ typeDescription }}.
        <br />
      </template>
      Variable supports <a href="#" @click="showDateModifications">additional modifications</a>.
    </div>
    <template v-if="type !== 'day'">
      <div>
        <DisplayVariable name="start_date" />
      </div>
      <div>
        First day of {{ typeDescription }} formatted using default format settings ({{ dateFormat }}).<br />
        Variable supports <a href="#" @click="showDateModifications">additional modifications</a>.
      </div>
      <div>
        <DisplayVariable name="end_date" />
      </div>
      <div>
        Last day of {{ typeDescription }} formatted using default format settings ({{ dateFormat }}).<br />
        Variable supports <a href="#" @click="showDateModifications">additional modifications</a>.
      </div>
    </template>
    <div>
      <DisplayVariable name="index" />
    </div>
    <div>Index of current {{ type === "custom" ? "interval" : type }} if enabled.</div>

    <div>
      <DisplayVariable name="current_date" />
    </div>
    <div>
      Current date (in YYYY-MM-DD format)<br />
      Variable supports <a href="#" @click="showDateModifications">additional modifications</a>.
    </div>
    <div>
      <DisplayVariable name="time" />
    </div>
    <div>
      Current time (in HH:mm format) <br />
      Variable supports <a href="#" @click="showDateModifications">additional modifications</a>.
    </div>
    <div>
      <DisplayVariable name="current_time" />
    </div>
    <div>
      Current time (in HH:mm format) <br />
      Variable supports <a href="#" @click="showDateModifications">additional modifications</a>.
    </div>
  </div>
</template>

<style scoped>
.hint {
  font-weight: bold;
}
.grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  line-height: 1.5;
}
</style>
