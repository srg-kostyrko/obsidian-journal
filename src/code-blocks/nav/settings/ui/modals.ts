import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";
import type { NavBlockSegment } from "@/journals/config";

import EditNavBlockRowModal from "./EditNavBlockRowModal.vue";

export interface EditNavBlockRowModalProps {
  journalName: string;
  row?: NavBlockSegment;
}

export const editNavBlockRowModal = defineModal<{ row: NavBlockSegment }>()({
  component: EditNavBlockRowModal,
  title: ({ row }: EditNavBlockRowModalProps) => m.nav_block_row_modal_title({ mode: row ? "edit" : "add" }),
});
