import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import EditTaskFilterModal from "./EditTaskFilterModal.vue";

import type { TaskRule } from "../conditions";

export interface EditTaskFilterModalProps {
  filter: TaskRule;
  showMode: boolean;
}

export const editTaskFilterModal = defineModal<TaskRule>()({
  component: EditTaskFilterModal,
  title: () => m.tasks_journal_filter_title(),
  width: 720,
});
