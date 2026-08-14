<script setup lang="ts">
import { computed } from "vue";

import { Clock } from "@/calendar";
import { m } from "@/i18n";

import { formatHasWrongWeek } from "./wrong-week";
import WrongWeekWarning from "./WrongWeekWarning.vue";

const { format } = defineProps<{ format: string }>();

const rendered = computed(() => Clock.now().format(format));
const wrongWeek = computed(() => formatHasWrongWeek(format));
</script>

<template>
  <div class="journal-date-format-preview">
    {{ m.journal_edit_date_format_preview_label() }}
    <b class="u-pop">{{ rendered }}</b>
  </div>
  <WrongWeekWarning v-if="wrongWeek" />
</template>
