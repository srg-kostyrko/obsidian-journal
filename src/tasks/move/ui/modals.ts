import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";

import ConfirmBlockLinkModal from "./ConfirmBlockLinkModal.vue";
import EditJournalMoveModal from "./EditJournalMoveModal.vue";

import type { JournalMoveConfig } from "../settings";

export const editJournalMoveModal = defineModal<JournalMoveConfig>()({
  component: EditJournalMoveModal,
  title: () => m.tasks_move_title(),
});

// The body says it all, so the dialog carries no heading.
export const confirmBlockLinkModal = defineModal()({
  component: ConfirmBlockLinkModal,
  title: () => "",
});
