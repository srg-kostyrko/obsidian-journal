<script setup lang="ts">
import { computed } from "vue";
import { date_from_string } from "../calendar";
import { VueModal } from "./modals/vue-modal";
import ObsidianButton from "./obsidian/ObsidianButton.vue";
import ObsidianIcon from "./obsidian/ObsidianIcon.vue";
import DatePickerModal from "./modals/DatePicker.modal.vue";
import { usePlugin } from "@/composables/use-plugin";

const props = withDefaults(
  defineProps<{
    picking?: "day" | "week" | "month" | "quarter" | "year";
    placeholder?: string;
    previewFormat?: string;
    disabled?: boolean;
    tooltip?: string;
    min?: string;
    max?: string;
  }>(),
  {
    picking: "day",
    placeholder: "Pick a date",
    previewFormat: "YYYY-MM-DD",
    tooltip: "Pick a date",
    min: "",
    max: "",
  },
);

const plugin = usePlugin();

const model = defineModel<string>();
const momentDate = computed(() => {
  if (model.value) {
    return date_from_string(model.value);
  }
  return null;
});
const formattedDate = computed(() => {
  if (momentDate.value) {
    return momentDate.value.format(props.previewFormat);
  }
  return props.placeholder;
});

function openPickerModal() {
  new VueModal(
    plugin,
    "Pick a date",
    DatePickerModal,
    {
      selectedDate: model.value,
      picking: props.picking,
      min: props.min,
      max: props.max,
      onSelect(date: string) {
        model.value = date;
      },
    },
    400,
  ).open();
}
</script>

<template>
  <ObsidianButton class="date-picker" :disabled="disabled" :tooltip="tooltip" @click="openPickerModal">
    <ObsidianIcon name="calendar" /> <span>{{ formattedDate }}</span>
  </ObsidianButton>
</template>

<style scoped>
.date-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
</style>
