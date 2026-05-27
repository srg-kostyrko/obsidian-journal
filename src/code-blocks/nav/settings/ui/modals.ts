import { m } from "@/i18n";
import { defineModal } from "@/infrastructure/host/modals";
import type { NavBlockRow } from "@/journals";

import EditNavBlockRowModal from "./EditNavBlockRowModal.vue";

export interface EditNavBlockRowModalProps {
  journalName: string;
  row?: NavBlockRow;
}

export const editNavBlockRowModal = defineModal<{ row: NavBlockRow }>()({
  component: EditNavBlockRowModal,
  title: ({ row }: EditNavBlockRowModalProps) => m.nav_block_row_modal_title({ mode: row ? "edit" : "add" }),
});
