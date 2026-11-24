<script setup lang="ts">
import { computed } from "vue";

import { Clock, type UserDateFormat } from "@/calendar";
import { m } from "@/i18n";

import { formatHasWrongWeek } from "./wrong-week";
import WrongWeekWarning from "./WrongWeekWarning.vue";

const { format } = defineProps<{ format: UserDateFormat }>();

const rendered = computed(() => Clock.now().tryFormat(format));
const wrongWeek = computed(() => formatHasWrongWeek(format));
</script>

<template>
  <div v-if="rendered.isOk()" class="journal-date-format-preview">
    {{ m.journal_edit_date_format_preview_label() }}
    <b class="u-pop">{{ rendered.value }}</b>
  </div>
  <div v-else class="journal-date-format-preview journal-hint">
    {{ m.date_format_invalid_preview({ reason: rendered.error.reason }) }}
  </div>
  <WrongWeekWarning v-if="wrongWeek" />
</template>

<style scoped>
.journal-hint {
  color: var(--text-warning);
}
</style>
