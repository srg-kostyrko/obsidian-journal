import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import EditJournalMoveModal from "./EditJournalMoveModal.vue";

import type { JournalMoveConfig } from "../settings";

export const editJournalMoveModal = defineModal<JournalMoveConfig>()({
  component: EditJournalMoveModal,
  title: () => m.tasks_move_title(),
});
