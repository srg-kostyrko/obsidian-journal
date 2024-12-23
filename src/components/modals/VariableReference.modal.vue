<script setup lang="ts">
import DisplayVariable from "../DisplayVariable.vue";
import type { JournalSettings } from "../../types/settings.types";

defineProps<{
  type: JournalSettings["write"]["type"];
  dateFormat: string;
}>();
defineEmits(["close"]);
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

    <template v-if="type === 'day'">
      <div>
        <DisplayVariable name="date" />
      </div>
      <div>
        Note date formatted using default format settings ({{ dateFormat }}).<br />
        You can also use <DisplayVariable name="date:format" /> to override format once, and use
        <DisplayVariable name="date+5d:format" /> to add 5 days.<br />
        <a target="_blank" href="https://momentjs.com/docs/#/displaying/format/">Formatting reference.</a>
        <br />
        <a target="_blank" href="https://momentjs.com/docs/#/manipulating/add/">Date manipulation reference.</a>
      </div>
    </template>
    <template v-else>
      <div>
        <DisplayVariable name="start_date" />
      </div>
      <div>
        First day of {{ type }} formatted using default format settings ({{ dateFormat }}).<br />
        You can also use <DisplayVariable name="start_date:format" /> to override format once, and use
        <DisplayVariable name="start_date+5d:format" /> to add 5 days.<br />
        <a target="_blank" href="https://momentjs.com/docs/#/displaying/format/">Formatting reference.</a>
        <br />
        <a target="_blank" href="https://momentjs.com/docs/#/manipulating/add/">Date manipulation reference.</a>
      </div>
      <div>
        <DisplayVariable name="end_date" />
      </div>
      <div>
        Last day of {{ type }} formatted using default format settings ({{ dateFormat }}).<br />
        You can also use <DisplayVariable name="end_date:format" /> to override format once, and use
        <DisplayVariable name="end_date+5d:format" /> to add 5 days.<br />
        <a target="_blank" href="https://momentjs.com/docs/#/displaying/format/">Formatting reference.</a>
        <br />
        <a target="_blank" href="https://momentjs.com/docs/#/manipulating/add/">Date manipulation reference.</a>
      </div>
    </template>
    <div>
      <DisplayVariable name="index" />
    </div>
    <div>Index of current {{ type === "custom" ? "interval" : type }} if enabled.</div>
  </div>
</template>

<style scoped>
.hint {
  color: var(--bold-color);
}
.grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  line-height: 1.5;
}
</style>
